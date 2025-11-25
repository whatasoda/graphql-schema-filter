/**
 * 型到達可能性クロージャアルゴリズム
 *
 * 指定された開始点（Query/Mutation フィールド、Object 型）から、
 * 推移的に参照されるすべての型を収集する
 */

import { GraphQLNamedType, GraphQLSchema } from "graphql";
import type { SchemaAnalysis } from "../types";
import { traverseGraphQLType } from "./traverse";

/**
 * DEBUG_REACHABILITY=1 でデバッグログを有効化
 */
const DEBUG = process.env.DEBUG_REACHABILITY === "1";

/**
 * 指定されたターゲットがフィールドにアクセス可能かを判定
 *
 * ルール:
 * - フィールドに @expose がある場合、そのターゲットリストで判定
 * - フィールドに @expose がない場合:
 *   - Query/Mutation/Subscription 型: 非公開（除外）
 *   - @disableAutoExpose が付いた型: 非公開（除外）
 *   - その他の output type: 公開（デフォルト公開）
 *
 * @param schema - GraphQLスキーマ
 * @param parsed - パース済みの @expose ディレクティブ情報
 * @param typeName - 型名
 * @param fieldName - フィールド名
 * @param target - ターゲット名
 * @returns フィールドが公開されている場合は true
 */
export function isFieldExposed({
  analysis,
  typeName,
  fieldName,
  target,
}: {
  analysis: SchemaAnalysis;
  typeName: string;
  fieldName: string;
  target: string;
}): boolean {
  const exposureInfo = analysis.exposureInfoMap.get(typeName);
  if (!exposureInfo) {
    return false;
  }

  // フィールドレベルの @expose をチェック
  const field = exposureInfo.fields.get(fieldName);
  if (field !== undefined) {
    return field.tags.includes(target);
  }

  // @expose がない場合の判定
  // Root 型または @disableAutoExpose が付いている型は除外
  if (exposureInfo.isRootType || exposureInfo.isAutoExposeDisabled) {
    return false;
  }

  // その他の output type はデフォルト公開
  return true;
}

/**
 * 到達可能な型名を yield する generator
 *
 * @param schema - GraphQL スキーマ
 * @param target - 対象ターゲット
 * @param analysis - @expose ディレクティブの解析結果
 * @yields 到達可能な型名
 *
 * @remarks
 * BFS アルゴリズムを使用して、エントリーポイントから推移的に参照される
 * すべての型名を yield します。ターゲットに公開されていないフィールド経由の型は
 * 到達不能と判定されます。
 *
 * @public
 * Advanced API: generator を直接使用することで、early termination や
 * lazy evaluation が可能です。通常のユースケースでは `computeReachability` を
 * 使用してください。
 */
export function traverseReachableTypes({
  schema,
  target,
  analysis,
}: {
  schema: GraphQLSchema;
  target: string;
  analysis: SchemaAnalysis;
}): Generator<GraphQLNamedType> {
  const entrypoints = Object.values(analysis.rootTypeNames)
    .map((typeName) => (typeName ? schema.getType(typeName) : null))
    .filter((type) => type != null);

  return traverseGraphQLType({
    schema,
    entrypoints,
    filter: (output) => {
      if (output.source === "objectField") {
        return isFieldExposed({
          analysis,
          typeName: output.typeName,
          fieldName: output.fieldName,
          target,
        });
      }

      if (
        output.source === "interfaceField" ||
        output.source === "inputField" ||
        output.source === "interfaceImplementedByObject" ||
        output.source === "objectImplementingInterface" ||
        output.source === "unionMember"
      ) {
        return true;
      }

      throw new Error(`Unsupported output source: ${output satisfies never}`);
    },
  });
}

/**
 * 型到達可能性を計算する
 *
 * @param schema - GraphQLスキーマ
 * @param target - 対象ターゲット
 * @param analysis - @expose ディレクティブの解析結果
 * @returns 到達可能な型名の集合
 *
 * @remarks
 * BFSアルゴリズムを使用して、エントリーポイントから推移的に参照される
 * すべての型を収集します。内部で generator を使用しますが、外部 API は
 * 通常の Set を返す純粋関数です。
 * ターゲットに公開されていないフィールド経由の型は到達不能と判定されます。
 */
export function computeReachability(
  schema: GraphQLSchema,
  target: string,
  analysis: SchemaAnalysis
): Set<string> {
  const reachableTypes = new Set<string>(
    Array.from(traverseReachableTypes({ schema, target, analysis })).map(
      (type) => {
        if (DEBUG) {
          console.log(`[Reachability] Discovered type: ${type.name}`);
        }
        return type.name;
      }
    )
  );

  if (DEBUG) {
    console.log(`[Reachability] Traversal complete. Total types discovered: `);
  }

  return reachableTypes;
}
