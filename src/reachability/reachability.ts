/**
 * 型到達可能性クロージャアルゴリズム
 *
 * 指定された開始点（Query/Mutation フィールド、Object 型）から、
 * 推移的に参照されるすべての型を収集する
 */

import {
  GraphQLNamedType,
  GraphQLSchema,
  NamedTypeNode,
  getNamedType,
  isObjectType,
  isInterfaceType,
  isIntrospectionType,
} from "graphql";
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
      if (output.source === "outputField") {
        return isFieldExposed({
          analysis,
          typeName: output.typeName,
          fieldName: output.fieldName,
          target,
        });
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

      if (output.source === "interfaceImplementation") {
        // Don't include interface implementations in first pass
        // They will be added in the second pass only if the interface is reached via a field
        return false;
      }

      if (output.source === "inputField") {
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
  const interfacesReachedViaFields = new Set<string>();

  // First pass: Normal traversal (track interfaces reached via fields)
  const reachableTypes = new Set<string>(
    Array.from(traverseReachableTypes({ schema, target, analysis })).map((type) => {
      if (DEBUG) {
        console.log(`[Reachability] Discovered type: ${type.name}`);
      }
      return type.name;
    })
  );

  // Collect interfaces that are used as field types
  const entrypoints = Object.values(analysis.rootTypeNames)
    .map((typeName) => (typeName ? schema.getType(typeName) : null))
    .filter((type) => type != null);

  const visited = new Set<string>();
  const queue = [...entrypoints];

  while (queue.length > 0) {
    const type = queue.shift()!;

    if (isIntrospectionType(type) || visited.has(type.name) || !reachableTypes.has(type.name)) {
      continue;
    }
    visited.add(type.name);

    if (isObjectType(type) || isInterfaceType(type)) {
      for (const field of Object.values(type.getFields())) {
        const fieldType = getNamedType(field.type);

        // Track if the field type is an interface
        if (isInterfaceType(fieldType) && reachableTypes.has(fieldType.name)) {
          interfacesReachedViaFields.add(fieldType.name);
        }

        if (reachableTypes.has(fieldType.name)) {
          queue.push(fieldType);
        }
      }
    }
  }

  // Second pass: Add implementations for interfaces reached via fields
  for (const interfaceName of interfacesReachedViaFields) {
    const interface_ = schema.getType(interfaceName);
    if (isInterfaceType(interface_)) {
      for (const implType of schema.getPossibleTypes(interface_)) {
        if (DEBUG && !reachableTypes.has(implType.name)) {
          console.log(`[Reachability] Adding interface implementation: ${implType.name} (for ${interfaceName})`);
        }
        reachableTypes.add(implType.name);
      }
    }
  }

  if (DEBUG) {
    console.log(`[Reachability] Traversal complete. Total types discovered: `);
  }

  return reachableTypes;
}
