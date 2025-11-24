/**
 * 型到達可能性クロージャアルゴリズム
 *
 * 指定された開始点（Query/Mutation フィールド、Object 型）から、
 * 推移的に参照されるすべての型を収集する
 */

import { GraphQLSchema } from "graphql";
import type { SchemaAnalysis } from "../types";
import { isFieldExposed } from "../parser/expose-parser";
import { traverseGraphQLType } from "./type-traverser";

/**
 * DEBUG_REACHABILITY=1 でデバッグログを有効化
 */
const DEBUG = process.env.DEBUG_REACHABILITY === "1";

/**
 * 到達可能な型名を yield する generator
 *
 * @param schema - GraphQL スキーマ
 * @param role - 対象ロール
 * @param analysis - @expose ディレクティブの解析結果
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
export function* traverseReachableTypes({
  schema,
  role,
  analysis,
}: {
  schema: GraphQLSchema;
  role: string;
  analysis: SchemaAnalysis;
}): Generator<string> {
  let discoveredCount = 0;

  const generator = traverseGraphQLType({
    schema,
    entrypoints: [
      schema.getQueryType(),
      schema.getMutationType(),
      schema.getSubscriptionType(),
    ].filter((type) => type != null),
    filter: (output) => {
      if (output.source === "outputField") {
        return isFieldExposed(
          schema,
          analysis,
          output.typeName,
          output.fieldName,
          role
        );
      }

      if (output.source === "interfaceField") {
        return true;
      }

      if (output.source === "implementedInterface") {
        return true;
      }

      if (output.source === "unionMember") {
        return true;
      }

      if (output.source === "inputField") {
        return true;
      }

      throw new Error(`Unsupported output source: ${output satisfies never}`);
    },
  });

  // BFS でクロージャを計算
  for (const type of generator) {
    discoveredCount++;

    if (DEBUG) {
      console.log(
        `[Reachability] Discovered type #${discoveredCount}: ${type.name}`
      );
    }

    yield type.name;
  }

  if (DEBUG) {
    console.log(
      `[Reachability] Traversal complete. Total types discovered: ${discoveredCount}`
    );
  }
}

/**
 * 型到達可能性を計算する
 *
 * @param schema - GraphQLスキーマ
 * @param role - 対象ロール
 * @param analysis - @expose ディレクティブの解析結果
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
  role: string,
  analysis: SchemaAnalysis
): Set<string> {
  return new Set<string>(traverseReachableTypes({ schema, role, analysis }));
}
