/**
 * メインスキーマフィルタリング関数
 *
 * 到達可能性アナライザー、@expose パーサー、スキーマフィルターを統合
 */

import { GraphQLSchema, getNamedType } from "graphql";
import type { EntryPoints, FilterSchemaOptions } from "../types";
import { parseExposeDirectives, isFieldExposed, debugExposeDirectives } from "../parser/expose-parser";
import { computeReachability } from "../analyzer/reachability";
import { buildFilteredSchema } from "./schema-filter";
import type { ParsedExposeDirectives } from "../types";

/**
 * スキーマをフィルタリングして、指定ロール用のスキーマを生成
 *
 * @param schema - 元のGraphQLスキーマ
 * @param options - フィルタリングオプション
 * @returns フィルタリング済みのGraphQLスキーマ
 *
 * @remarks
 * 4フェーズのパイプラインを使用:
 * 1. Parse: @expose ディレクティブを抽出
 * 2. Infer Entry Points: エントリーポイントを決定（自動推論または明示的指定）
 * 3. Reachability: BFSで到達可能な型を計算
 * 4. Filter: スキーマをフィルタリングして再構築
 */
export async function filterSchemaForRole(
  schema: GraphQLSchema,
  options: FilterSchemaOptions
): Promise<GraphQLSchema> {
  const {
    role,
    autoInferEntryPoints = true,
    entryPoints,
    reachabilityConfig,
    filterConfig,
  } = options;

  // Phase 1: @expose ディレクティブをパース
  const parsedDirectives = parseExposeDirectives(schema);

  // DEBUG: パース結果を出力
  if (process.env.DEBUG_EXPOSE_PARSER) {
    debugExposeDirectives(parsedDirectives);
  }

  // Phase 2: 開始点を決定
  const finalEntryPoints = autoInferEntryPoints
    ? inferEntryPointsFromExpose(schema, parsedDirectives, role)
    : normalizeEntryPoints(entryPoints);

  console.log(`Entry points for role "${role}":`);
  console.log(`  Queries: [${finalEntryPoints.queries.join(", ")}]`);
  console.log(`  Mutations: [${finalEntryPoints.mutations.join(", ")}]`);
  console.log(`  Types: [${finalEntryPoints.types.join(", ")}]`);

  // Phase 3: 到達可能な型を計算
  const reachableTypes = computeReachability(
    schema,
    finalEntryPoints,
    reachabilityConfig
  );

  console.log(`Reachable types: ${reachableTypes.size}`);

  // Phase 4: スキーマをフィルタリング
  const filteredSchema = buildFilteredSchema(
    schema,
    role,
    reachableTypes,
    parsedDirectives,
    filterConfig
  );

  console.log(`Filtered schema created for role "${role}"`);

  return filteredSchema;
}

/**
 * 明示的なエントリーポイントをEntryPoints型に正規化
 */
function normalizeEntryPoints(
  entryPoints?: Partial<EntryPoints>
): EntryPoints {
  return {
    queries: entryPoints?.queries ?? [],
    mutations: entryPoints?.mutations ?? [],
    types: entryPoints?.types ?? [],
  };
}

/**
 * @expose ディレクティブから開始点を自動推論
 *
 * @param schema - GraphQLスキーマ
 * @param parsedDirectives - パース済みの @expose ディレクティブ情報
 * @param role - 対象ロール
 * @returns 推論されたエントリーポイント
 */
function inferEntryPointsFromExpose(
  schema: GraphQLSchema,
  parsedDirectives: ParsedExposeDirectives,
  role: string
): EntryPoints {
  const queries: string[] = [];
  const mutations: string[] = [];
  const types: string[] = [];

  // Query 型から公開されているフィールドを収集
  const queryType = schema.getQueryType();
  if (queryType) {
    const queryFields = queryType.getFields();
    for (const [fieldName, field] of Object.entries(queryFields)) {
      if (isFieldExposed(schema, parsedDirectives, "Query", fieldName, role)) {
        queries.push(fieldName);
        // Query フィールドの返り値型をエントリーポイントに追加
        const returnType = getNamedType(field.type);
        if (!types.includes(returnType.name)) {
          types.push(returnType.name);
        }
      }
    }
  }

  // Mutation 型から公開されているフィールドを収集
  const mutationType = schema.getMutationType();
  if (mutationType) {
    const mutationFields = mutationType.getFields();
    for (const [fieldName, field] of Object.entries(mutationFields)) {
      if (
        isFieldExposed(schema, parsedDirectives, "Mutation", fieldName, role)
      ) {
        mutations.push(fieldName);
        // Mutation フィールドの返り値型をエントリーポイントに追加
        const returnType = getNamedType(field.type);
        if (!types.includes(returnType.name)) {
          types.push(returnType.name);
        }
      }
    }
  }

  return { queries, mutations, types };
}
