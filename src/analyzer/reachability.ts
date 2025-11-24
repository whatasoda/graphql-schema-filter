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
  GraphQLUnionType,
} from "graphql";
import type { EntryPoints, ReachabilityConfig } from "../types";
import {
  getNamedType,
  TypeKind,
  getArgumentTypes,
  getInputFieldTypes,
  isIntrospectionType,
} from "../utils/type-utils";

const DEFAULT_CONFIG: ReachabilityConfig = {
  includeInterfaceImplementations: true,
  includeReferenced: "all",
};

/**
 * Object/Interface 型の参照を辿る
 */
export function traverseObjectOrInterface(
  type: GraphQLObjectType | GraphQLInterfaceType,
  schema: GraphQLSchema,
  config: ReachabilityConfig,
  addToQueue: (type: GraphQLNamedType) => void
): void {
  const fields = type.getFields();

  // すべてのフィールドを走査
  Object.values(fields).forEach((field) => {
    // 戻り値の型を追加
    if (config.includeReferenced === "all") {
      const returnType = getNamedType(field.type);
      addToQueue(returnType);
    }

    // 引数の型を追加
    const argTypes = getArgumentTypes(field);
    argTypes.forEach((argType) => addToQueue(argType));
  });

  // Interface の場合、実装型も追加
  if (TypeKind.isInterface(type) && config.includeInterfaceImplementations) {
    const implementations = schema.getPossibleTypes(type);
    implementations.forEach((implType) => addToQueue(implType));
  }
}

/**
 * Union 型の参照を辿る
 */
export function traverseUnion(
  type: GraphQLUnionType,
  schema: GraphQLSchema,
  addToQueue: (type: GraphQLNamedType) => void
): void {
  const possibleTypes = schema.getPossibleTypes(type);
  possibleTypes.forEach((memberType) => addToQueue(memberType));
}

/**
 * InputObject 型の参照を辿る
 */
export function traverseInputObject(
  type: GraphQLNamedType,
  addToQueue: (type: GraphQLNamedType) => void
): void {
  if (!TypeKind.isInputObject(type)) return;

  const fieldTypes = getInputFieldTypes(type);
  fieldTypes.forEach((fieldType) => addToQueue(fieldType));
}

/**
 * 型の種類に応じて参照を辿る
 */
export function traverseType(
  type: GraphQLNamedType,
  schema: GraphQLSchema,
  config: ReachabilityConfig,
  addToQueue: (type: GraphQLNamedType) => void
): void {
  if (config.includeReferenced === "none") {
    // 参照を辿らない設定の場合はここで終了
    return;
  }

  if (TypeKind.isObject(type) || TypeKind.isInterface(type)) {
    traverseObjectOrInterface(type, schema, config, addToQueue);
  } else if (TypeKind.isUnion(type)) {
    traverseUnion(type, schema, addToQueue);
  } else if (TypeKind.isInputObject(type)) {
    traverseInputObject(type, addToQueue);
  }
  // Scalar/Enum は参照を持たないのでスキップ
}

/**
 * ルート型（Query/Mutation）を取得
 */
export function getRootType(
  schema: GraphQLSchema,
  rootTypeName: "Query" | "Mutation"
): GraphQLObjectType | undefined {
  if (rootTypeName === "Query") {
    return schema.getQueryType() ?? undefined;
  } else if (rootTypeName === "Mutation") {
    return schema.getMutationType() ?? undefined;
  }
  return undefined;
}

/**
 * 開始点として Query/Mutation のフィールドを追加
 */
export function addRootField(
  schema: GraphQLSchema,
  rootTypeName: "Query" | "Mutation",
  fieldName: string,
  addToQueue: (type: GraphQLNamedType) => void
): void {
  const rootType = getRootType(schema, rootTypeName);
  if (!rootType) {
    console.warn(`Root type ${rootTypeName} not found in schema`);
    return;
  }

  const fields = rootType.getFields();
  const field = fields[fieldName];
  if (!field) {
    console.warn(`Field ${fieldName} not found in ${rootTypeName} type`);
    return;
  }

  // 戻り値の型を開始点として追加
  const returnType = getNamedType(field.type);
  addToQueue(returnType);

  // 引数の型も開始点として追加
  const argTypes = getArgumentTypes(field);
  argTypes.forEach((argType) => addToQueue(argType));
}

/**
 * 開始点として Object 型を追加
 */
export function addTypeToQueue(
  schema: GraphQLSchema,
  typeName: string,
  addToQueue: (type: GraphQLNamedType) => void
): void {
  const type = schema.getType(typeName);
  if (!type) {
    console.warn(`Type ${typeName} not found in schema`);
    return;
  }

  addToQueue(type);
}

/**
 * 型到達可能性を計算する
 *
 * @param schema - GraphQLスキーマ
 * @param entryPoints - エントリーポイント（queries, mutations, types）
 * @param config - 到達可能性解析の設定
 * @returns 到達可能な型名の集合
 *
 * @remarks
 * BFSアルゴリズムを使用して、エントリーポイントから推移的に参照される
 * すべての型を収集します。内部状態を使用しますが、外部APIは純粋関数です。
 */
export function computeReachability(
  schema: GraphQLSchema,
  entryPoints: EntryPoints,
  config?: Partial<ReachabilityConfig>
): Set<string> {
  const finalConfig: ReachabilityConfig = { ...DEFAULT_CONFIG, ...config };
  const reachableTypes = new Set<string>();
  const workQueue: GraphQLNamedType[] = [];

  /**
   * 作業キューに型を追加
   */
  function addToQueue(type: GraphQLNamedType): void {
    // すでに訪問済みならスキップ
    if (reachableTypes.has(type.name)) {
      return;
    }
    // キューに追加
    workQueue.push(type);
  }

  // エントリーポイントを初期化
  // Query フィールドを追加
  entryPoints.queries.forEach((queryName) => {
    addRootField(schema, "Query", queryName, addToQueue);
  });

  // Mutation フィールドを追加
  entryPoints.mutations.forEach((mutationName) => {
    addRootField(schema, "Mutation", mutationName, addToQueue);
  });

  // 型を追加
  entryPoints.types.forEach((typeName) => {
    addTypeToQueue(schema, typeName, addToQueue);
  });

  // BFSでクロージャを計算
  while (workQueue.length > 0) {
    const type = workQueue.shift()!;

    // すでに訪問済みならスキップ
    if (reachableTypes.has(type.name)) {
      continue;
    }

    // Introspection 型はスキップ
    if (isIntrospectionType(type)) {
      continue;
    }

    // 到達可能な型として記録
    reachableTypes.add(type.name);

    // 型の種類に応じて参照を辿る
    traverseType(type, schema, finalConfig, addToQueue);
  }

  return reachableTypes;
}

/**
 * スキーマから到達可能な型を計算するヘルパー関数
 * @deprecated Use computeReachability instead
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
  const normalizedEntryPoints: EntryPoints = {
    queries: entryPoints.queries ?? [],
    mutations: entryPoints.mutations ?? [],
    types: entryPoints.types ?? [],
  };

  return computeReachability(schema, normalizedEntryPoints, config);
}
