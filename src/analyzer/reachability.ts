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
} from "graphql";
import type {
  EntryPoints,
  ReachabilityConfig,
  ParsedExposeDirectives,
} from "../types";
import {
  getNamedType,
  TypeKind,
  getArgumentTypes,
  getInputFieldTypes,
  isIntrospectionType,
} from "../utils/type-utils";
import { isFieldExposed } from "../parser/expose-parser";

const DEFAULT_CONFIG: ReachabilityConfig = {
  includeInterfaceImplementations: true,
  includeReferenced: "all",
};

/**
 * DEBUG_REACHABILITY=1 でデバッグログを有効化
 */
const DEBUG = process.env.DEBUG_REACHABILITY === "1";

/**
 * 指定された型から参照される型を yield する generator
 *
 * @param type - 探索対象の型
 * @param schema - GraphQL スキーマ
 * @param role - 対象ロール（フィールド公開判定に使用）
 * @param parsedDirectives - パース済みの @expose ディレクティブ情報
 * @param config - 到達可能性解析の設定
 * @yields 型から参照される GraphQL 型
 */
function* yieldReferencedTypes(
  type: GraphQLNamedType,
  schema: GraphQLSchema,
  role: string,
  parsedDirectives: ParsedExposeDirectives,
  config: ReachabilityConfig
): Generator<GraphQLNamedType> {
  if (config.includeReferenced === "none") {
    // 参照を辿らない設定の場合は何も yield しない
    return;
  }

  if (TypeKind.isObject(type) || TypeKind.isInterface(type)) {
    // Object/Interface の場合
    const fields = type.getFields();

    for (const field of Object.values(fields)) {
      // フィールドが role に公開されているかチェック
      if (!isFieldExposed(schema, parsedDirectives, type.name, field.name, role)) {
        continue; // 公開されていないフィールドはスキップ
      }

      // 戻り値の型を yield
      if (config.includeReferenced === "all") {
        const returnType = getNamedType(field.type);
        yield returnType;
      }

      // 引数の型を yield
      const argTypes = getArgumentTypes(field);
      for (const argType of argTypes) {
        yield argType;
      }
    }

    // Interface の場合、実装型も yield
    if (TypeKind.isInterface(type) && config.includeInterfaceImplementations) {
      const implementations = schema.getPossibleTypes(type);
      for (const implType of implementations) {
        yield implType;
      }
    }
  } else if (TypeKind.isUnion(type)) {
    // Union の場合
    const possibleTypes = schema.getPossibleTypes(type);
    for (const memberType of possibleTypes) {
      yield memberType;
    }
  } else if (TypeKind.isInputObject(type)) {
    // InputObject の場合
    const fieldTypes = getInputFieldTypes(type);
    for (const fieldType of fieldTypes) {
      yield fieldType;
    }
  }
  // Scalar/Enum は参照を持たないので何も yield しない
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
 * 到達可能な型名を yield する generator
 *
 * @param schema - GraphQL スキーマ
 * @param entryPoints - エントリーポイント（queries, mutations, types）
 * @param role - 対象ロール
 * @param parsedDirectives - パース済みの @expose ディレクティブ情報
 * @param config - 到達可能性解析の設定
 * @yields 到達可能な型名
 *
 * @remarks
 * BFS アルゴリズムを使用して、エントリーポイントから推移的に参照される
 * すべての型名を yield します。ロールに公開されていないフィールド経由の型は
 * 到達不能と判定されます。
 *
 * @public
 * Advanced API: generator を直接使用することで、early termination や
 * lazy evaluation が可能です。通常のユースケースでは `computeReachability` を
 * 使用してください。
 */
export function* traverseReachableTypes(
  schema: GraphQLSchema,
  entryPoints: EntryPoints,
  role: string,
  parsedDirectives: ParsedExposeDirectives,
  config: ReachabilityConfig
): Generator<string> {
  const visited = new Set<string>();
  const workQueue: GraphQLNamedType[] = [];

  /**
   * 作業キューに型を追加
   */
  function addToQueue(type: GraphQLNamedType): void {
    // すでに訪問済みならスキップ
    if (visited.has(type.name)) {
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

  if (DEBUG) {
    const entryPointCount =
      entryPoints.queries.length + entryPoints.mutations.length + entryPoints.types.length;
    console.log(`[Reachability] Starting traversal with ${entryPointCount} entry points`);
    console.log(`[Reachability] Initial queue size: ${workQueue.length}`);
  }

  let discoveredCount = 0;

  // BFS でクロージャを計算
  while (workQueue.length > 0) {
    const type = workQueue.shift()!;

    // すでに訪問済みならスキップ
    if (visited.has(type.name)) {
      continue;
    }

    // Introspection 型はスキップ
    if (isIntrospectionType(type)) {
      continue;
    }

    // 到達可能な型として記録し、yield
    visited.add(type.name);
    discoveredCount++;

    if (DEBUG) {
      console.log(`[Reachability] Discovered type #${discoveredCount}: ${type.name}`);
    }

    yield type.name;

    // 型から参照される型を探索
    const referencedTypes = [...yieldReferencedTypes(
      type,
      schema,
      role,
      parsedDirectives,
      config
    )];

    if (DEBUG && referencedTypes.length > 0) {
      console.log(`[Reachability]   → References ${referencedTypes.length} types: ${referencedTypes.map(t => t.name).join(", ")}`);
    }

    for (const referencedType of referencedTypes) {
      addToQueue(referencedType);
    }
  }

  if (DEBUG) {
    console.log(`[Reachability] Traversal complete. Total types discovered: ${discoveredCount}`);
  }
}

/**
 * 型到達可能性を計算する
 *
 * @param schema - GraphQLスキーマ
 * @param entryPoints - エントリーポイント（queries, mutations, types）
 * @param role - 対象ロール
 * @param parsedDirectives - パース済みの @expose ディレクティブ情報
 * @param config - 到達可能性解析の設定
 * @returns 到達可能な型名の集合
 *
 * @remarks
 * BFSアルゴリズムを使用して、エントリーポイントから推移的に参照される
 * すべての型を収集します。内部で generator を使用しますが、外部 API は
 * 通常の Set を返す純粋関数です。
 * ロールに公開されていないフィールド経由の型は到達不能と判定されます。
 */
export function computeReachability(
  schema: GraphQLSchema,
  entryPoints: EntryPoints,
  role: string,
  parsedDirectives: ParsedExposeDirectives,
  config?: Partial<ReachabilityConfig>
): Set<string> {
  const finalConfig: ReachabilityConfig = { ...DEFAULT_CONFIG, ...config };
  const reachableTypes = new Set<string>();

  for (const typeName of traverseReachableTypes(
    schema,
    entryPoints,
    role,
    parsedDirectives,
    finalConfig
  )) {
    reachableTypes.add(typeName);
  }

  return reachableTypes;
}
