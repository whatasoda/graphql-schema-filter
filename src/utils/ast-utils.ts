/**
 * AST 操作用ユーティリティ関数
 */

import type { TypeNode, FieldDefinitionNode, InputValueDefinitionNode } from "graphql";
import type { ParsedExposeDirectives } from "../types";

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
 * 型名が Root 型（Query/Mutation/Subscription）かを判定
 *
 * @param typeName - 型名
 * @returns Root 型の場合 true
 */
export function isRootTypeName(typeName: string): boolean {
  return (
    typeName === "Query" || typeName === "Mutation" || typeName === "Subscription"
  );
}

/**
 * AST FieldDefinitionNode から指定されたロールがフィールドにアクセス可能かを判定
 *
 * @param typeName - 親型の名前
 * @param field - フィールド定義 AST ノード
 * @param parsed - パース済みの @expose ディレクティブ情報
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
  parsed: ParsedExposeDirectives,
  role: string
): boolean {
  // フィールドレベルの @expose をチェック
  const fieldTags = parsed.fieldExposeMap.get(typeName)?.get(field.name.value);
  if (fieldTags !== undefined) {
    return fieldTags.includes(role);
  }

  // @expose がない場合の判定
  // Root 型または @disableAutoExpose が付いている型は除外
  if (
    isRootTypeName(typeName) ||
    parsed.typeDisableAutoExposeSet.has(typeName)
  ) {
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
 * @param parsed - パース済みの @expose ディレクティブ情報
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
  parsed: ParsedExposeDirectives,
  role: string
): boolean {
  // フィールドレベルの @expose をチェック
  const fieldTags = parsed.fieldExposeMap.get(typeName)?.get(field.name.value);

  if (fieldTags !== undefined) {
    // @expose がある場合、ロールが含まれているかチェック
    return fieldTags.includes(role);
  }

  // @expose がない場合はデフォルトで含める（寛容モード）
  return true;
}
