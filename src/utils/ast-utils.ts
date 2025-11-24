/**
 * AST 操作用ユーティリティ関数
 */

import type {
  TypeNode,
  FieldDefinitionNode,
  InputValueDefinitionNode,
} from "graphql";
import type { SchemaAnalysis } from "../types";

/**
 * TypeNode から型名を取得（NonNull/List を unwrap）
 *
 * @param typeNode - GraphQL AST TypeNode
 * @returns 名前付き型の名前
 *
 * @example
 * getTypeNameFromTypeNode({ kind: 'NamedType', name: { value: 'User' } }) // => 'User'
 * getTypeNameFromTypeNode({ kind: 'NonNullType', type: { kind: 'NamedType', name: { value: 'User' } } }) // => 'User'
 * getTypeNameFromTypeNode({ kind: 'ListType', type: { kind: 'NamedType', name: { value: 'User' } } }) // => 'User'
 */
export function getTypeNameFromTypeNode(typeNode: TypeNode): string {
  if (typeNode.kind === "NonNullType" || typeNode.kind === "ListType") {
    return getTypeNameFromTypeNode(typeNode.type);
  }
  return typeNode.name.value;
}

/**
 * AST FieldDefinitionNode から指定されたロールがフィールドにアクセス可能かを判定
 *
 * @param typeName - 親型の名前
 * @param field - フィールド定義 AST ノード
 * @param analysis - SchemaAnalysis 情報
 * @param role - ロール名
 * @returns フィールドが公開されている場合 true
 *
 * @remarks
 * ルール:
 * - フィールドに @expose がある場合、そのロールリストで判定
 * - フィールドに @expose がない場合:
 *   - Query/Mutation/Subscription 型: 非公開（除外）
 *   - @disableAutoExpose が付いた型: 非公開（除外）
 *   - その他の output type: 公開（デフォルト公開）
 */
export function isFieldExposedFromAST(
  typeName: string,
  field: FieldDefinitionNode,
  analysis: SchemaAnalysis,
  role: string
): boolean {
  const exposureInfo = analysis.exposureInfoMap.get(typeName);
  if (!exposureInfo) {
    return false;
  }

  // フィールドレベルの @expose をチェック
  const fieldInfo = exposureInfo.fields.get(field.name.value);
  if (fieldInfo !== undefined) {
    return fieldInfo.tags.includes(role);
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
 * AST InputValueDefinitionNode から指定されたロールがフィールドにアクセス可能かを判定
 * InputObject は寛容モード: @expose がない場合はデフォルトで含める
 *
 * @param typeName - 親型の名前
 * @param field - InputObject フィールド定義 AST ノード
 * @param analysis - SchemaAnalysis 情報
 * @param role - ロール名
 * @returns フィールドが公開されている場合 true
 *
 * @remarks
 * InputObject フィールドは寛容モード:
 * - @expose がある場合のみチェックし、ロールが含まれているか判定
 * - @expose がない場合はデフォルトで含める（true を返す）
 */
export function isInputFieldExposedFromAST(
  typeName: string,
  field: InputValueDefinitionNode,
  analysis: SchemaAnalysis,
  role: string
): boolean {
  const exposureInfo = analysis.exposureInfoMap.get(typeName);
  if (!exposureInfo) {
    // 型情報がない場合、デフォルトで含める（寛容モード）
    return true;
  }

  // フィールドレベルの @expose をチェック
  const fieldInfo = exposureInfo.fields.get(field.name.value);
  if (fieldInfo !== undefined) {
    // @expose がある場合、ロールが含まれているかチェック
    return fieldInfo.tags.includes(role);
  }

  // @expose がない場合はデフォルトで含める（寛容モード）
  return true;
}
