/**
 * 型到達可能性クロージャアルゴリズム
 *
 * 指定された開始点（Query/Mutation フィールド、Object 型）から、
 * 推移的に参照されるすべての型を収集する
 */

import {
  GraphQLSchema,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLField,
} from "graphql";
import {
  getNamedType,
  TypeKind,
  getArgumentTypes,
  getInputFieldTypes,
  isIntrospectionType,
} from "../utils/type-utils";

export interface ReachabilityConfig {
  /**
   * Interface の実装型（possibleTypes）も含めるか
   * @default true
   */
  includeInterfaceImplementations: boolean;

  /**
   * 参照型の含め方
   * - 'all': すべての参照型を含める（既定）
   * - 'args-only': 引数型のみ含め、戻り値はシードの直近のみ
   * - 'none': シードのフィールドのみ（参照を辿らない）
   */
  includeReferenced: "all" | "args-only" | "none";
}

const DEFAULT_CONFIG: ReachabilityConfig = {
  includeInterfaceImplementations: true,
  includeReferenced: "all",
};

/**
 * 型到達可能性アナライザー
 */
export class ReachabilityAnalyzer {
  private schema: GraphQLSchema;
  private config: ReachabilityConfig;
  private reachableTypes: Set<string> = new Set();
  private workQueue: GraphQLNamedType[] = [];

  constructor(schema: GraphQLSchema, config?: Partial<ReachabilityConfig>) {
    this.schema = schema;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 開始点として Query/Mutation のフィールドを追加
   */
  addRootField(rootTypeName: "Query" | "Mutation", fieldName: string): void {
    const rootType = this.getRootType(rootTypeName);
    if (!rootType) {
      console.warn(`Root type ${rootTypeName} not found in schema`);
      return;
    }

    const fields = rootType.getFields();
    const field = fields[fieldName];
    if (!field) {
      console.warn(
        `Field ${fieldName} not found in ${rootTypeName} type`
      );
      return;
    }

    // 戻り値の型を開始点として追加
    const returnType = getNamedType(field.type);
    this.addToWorkQueue(returnType);

    // 引数の型も開始点として追加
    const argTypes = getArgumentTypes(field);
    argTypes.forEach((argType) => this.addToWorkQueue(argType));
  }

  /**
   * 開始点として Object 型を追加
   */
  addType(typeName: string): void {
    const type = this.schema.getType(typeName);
    if (!type) {
      console.warn(`Type ${typeName} not found in schema`);
      return;
    }

    this.addToWorkQueue(type);
  }

  /**
   * 到達可能な全型を計算（BFS）
   */
  computeClosure(): Set<string> {
    while (this.workQueue.length > 0) {
      const type = this.workQueue.shift()!;

      // すでに訪問済みならスキップ
      if (this.reachableTypes.has(type.name)) {
        continue;
      }

      // Introspection 型はスキップ
      if (isIntrospectionType(type)) {
        continue;
      }

      // 到達可能な型として記録
      this.reachableTypes.add(type.name);

      // 型の種類に応じて参照を辿る
      this.traverseType(type);
    }

    return this.reachableTypes;
  }

  /**
   * 型の種類に応じて参照を辿る
   */
  private traverseType(type: GraphQLNamedType): void {
    if (this.config.includeReferenced === "none") {
      // 参照を辿らない設定の場合はここで終了
      return;
    }

    if (TypeKind.isObject(type) || TypeKind.isInterface(type)) {
      this.traverseObjectOrInterface(type);
    } else if (TypeKind.isUnion(type)) {
      this.traverseUnion(type);
    } else if (TypeKind.isInputObject(type)) {
      this.traverseInputObject(type);
    }
    // Scalar/Enum は参照を持たないのでスキップ
  }

  /**
   * Object/Interface 型の参照を辿る
   */
  private traverseObjectOrInterface(
    type: GraphQLObjectType | GraphQLInterfaceType
  ): void {
    const fields = type.getFields();

    // すべてのフィールドを走査
    Object.values(fields).forEach((field) => {
      // 戻り値の型を追加
      if (this.config.includeReferenced === "all") {
        const returnType = getNamedType(field.type);
        this.addToWorkQueue(returnType);
      }

      // 引数の型を追加
      const argTypes = getArgumentTypes(field);
      argTypes.forEach((argType) => this.addToWorkQueue(argType));
    });

    // Interface の場合、実装型も追加
    if (
      TypeKind.isInterface(type) &&
      this.config.includeInterfaceImplementations
    ) {
      const implementations = this.schema.getPossibleTypes(type);
      implementations.forEach((implType) => this.addToWorkQueue(implType));
    }
  }

  /**
   * Union 型の参照を辿る
   */
  private traverseUnion(type: GraphQLInterfaceType): void {
    const possibleTypes = this.schema.getPossibleTypes(type);
    possibleTypes.forEach((memberType) => this.addToWorkQueue(memberType));
  }

  /**
   * InputObject 型の参照を辿る
   */
  private traverseInputObject(type: GraphQLNamedType): void {
    if (!TypeKind.isInputObject(type)) return;

    const fieldTypes = getInputFieldTypes(type);
    fieldTypes.forEach((fieldType) => this.addToWorkQueue(fieldType));
  }

  /**
   * 作業キューに型を追加
   */
  private addToWorkQueue(type: GraphQLNamedType): void {
    // すでに訪問済みならスキップ
    if (this.reachableTypes.has(type.name)) {
      return;
    }

    // キューに追加
    this.workQueue.push(type);
  }

  /**
   * ルート型（Query/Mutation）を取得
   */
  private getRootType(
    rootTypeName: "Query" | "Mutation"
  ): GraphQLObjectType | undefined {
    if (rootTypeName === "Query") {
      return this.schema.getQueryType() ?? undefined;
    } else if (rootTypeName === "Mutation") {
      return this.schema.getMutationType() ?? undefined;
    }
    return undefined;
  }

  /**
   * デバッグ用：到達可能な型の一覧を取得
   */
  getReachableTypeNames(): string[] {
    return Array.from(this.reachableTypes).sort();
  }
}

/**
 * スキーマから到達可能な型を計算するヘルパー関数
 */
export function analyzeReachability(
  schema: GraphQLSchema,
  entryPoints: {
    queries?: string[];
    mutations?: string[];
    types?: string[];
  },
  config?: Partial<ReachabilityConfig>
): Set<string> {
  const analyzer = new ReachabilityAnalyzer(schema, config);

  // Query フィールドを追加
  entryPoints.queries?.forEach((queryName) => {
    analyzer.addRootField("Query", queryName);
  });

  // Mutation フィールドを追加
  entryPoints.mutations?.forEach((mutationName) => {
    analyzer.addRootField("Mutation", mutationName);
  });

  // 型を追加
  entryPoints.types?.forEach((typeName) => {
    analyzer.addType(typeName);
  });

  // クロージャを計算
  return analyzer.computeClosure();
}
