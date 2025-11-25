/**
 * メインスキーマフィルタリング関数
 *
 * 到達可能性アナライザー、@expose パーサー、スキーマフィルターを統合
 */

import {
  GraphQLSchema,
  printSchema,
  parse,
  buildASTSchema,
  Kind,
} from "graphql";
import type { FilterSchemaOptions } from "../types";
import { FilterSchemaOptionsSchema } from "../types";
import {
  createSchemaAnalysis,
  debugSchemaAnalysis,
} from "../analysis/schema-analysis";
import { computeReachability } from "../reachability/reachability";
import { filterDefinitionsAST } from "./ast-filter";
import { logger } from "../utils/logger";

/**
 * スキーマをフィルタリングして、指定ターゲット用のスキーマを生成
 *
 * @param schema - 元のGraphQLスキーマ
 * @param options - フィルタリングオプション
 * @returns フィルタリング済みのGraphQLスキーマ
 *
 * @remarks
 * 6フェーズのパイプラインを使用:
 * 1. Parse: @expose ディレクティブを抽出（Schema API）
 * 2. Infer Entry Points: エントリーポイントを決定（自動推論または明示的指定）
 * 3. Reachability: BFSで到達可能な型を計算（Schema API）
 * 4. AST Conversion: Schema を SDL → AST に変換
 * 5. AST Filtering: AST 定義を到達可能性・expose ルールでフィルタリング
 * 6. Schema Building: フィルタリング済み AST から新しいスキーマを構築
 */
export async function filterSchema(
  schema: GraphQLSchema,
  options: FilterSchemaOptions
): Promise<GraphQLSchema> {
  // 入力検証
  const validatedOptions = FilterSchemaOptionsSchema.parse(options);
  const { target } = validatedOptions;

  // Phase 1: @expose ディレクティブをパース
  const analysis = createSchemaAnalysis(schema);

  // DEBUG: パース結果を出力（LOG_LEVEL=debug で有効）
  debugSchemaAnalysis(analysis);

  // Phase 3: 到達可能な型を計算
  const reachableTypes = computeReachability(schema, target, analysis);

  logger.info(`Reachable types: ${reachableTypes.size}`);

  // Phase 4: Schema → AST に変換
  const sdl = printSchema(schema);
  const ast = parse(sdl);

  // Phase 5: AST をフィルタリング
  const filteredDefinitions = filterDefinitionsAST(
    ast,
    target,
    reachableTypes,
    analysis
  );

  // Phase 6: フィルタリング済み AST から新しいスキーマを構築
  const filteredSchema = buildASTSchema({
    kind: Kind.DOCUMENT,
    definitions: filteredDefinitions,
  });

  logger.info(`Filtered schema created for target "${target}"`);

  return filteredSchema;
}
