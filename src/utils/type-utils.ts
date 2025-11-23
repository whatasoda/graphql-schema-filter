/**
 * GraphQL 型システムを扱うためのユーティリティ関数
 */

import {
  GraphQLType,
  GraphQLNamedType,
  GraphQLNonNull,
  GraphQLList,
  isNonNullType,
  isListType,
  isObjectType,
  isInterfaceType,
  isUnionType,
  isInputObjectType,
  isEnumType,
  isScalarType,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLUnionType,
  GraphQLInputObjectType,
  GraphQLEnumType,
  GraphQLScalarType,
  GraphQLField,
  GraphQLInputField,
} from "graphql";

/**
 * NonNull/List ラッパーを剥いで、内部の Named Type を取得
 *
 * 例:
 * - [User!]! → User
 * - [String]! → String
 * - User! → User
 */
export function getNamedType(type: GraphQLType): GraphQLNamedType {
  let currentType: GraphQLType = type;

  // NonNull と List を再帰的に剥いでいく
  while (isNonNullType(currentType) || isListType(currentType)) {
    currentType = currentType.ofType;
  }

  return currentType as GraphQLNamedType;
}

/**
 * 型の種類を判定するヘルパー関数群
 */
export const TypeKind = {
  isObject: (type: GraphQLNamedType): type is GraphQLObjectType =>
    isObjectType(type),
  isInterface: (type: GraphQLNamedType): type is GraphQLInterfaceType =>
    isInterfaceType(type),
  isUnion: (type: GraphQLNamedType): type is GraphQLUnionType =>
    isUnionType(type),
  isInputObject: (type: GraphQLNamedType): type is GraphQLInputObjectType =>
    isInputObjectType(type),
  isEnum: (type: GraphQLNamedType): type is GraphQLEnumType =>
    isEnumType(type),
  isScalar: (type: GraphQLNamedType): type is GraphQLScalarType =>
    isScalarType(type),
} as const;

/**
 * フィールドの引数からすべての型を抽出
 */
export function getArgumentTypes(
  field: GraphQLField<unknown, unknown>
): GraphQLNamedType[] {
  return field.args.map((arg) => getNamedType(arg.type));
}

/**
 * InputObject のすべてのフィールド型を抽出
 */
export function getInputFieldTypes(
  inputType: GraphQLInputObjectType
): GraphQLNamedType[] {
  const fields = inputType.getFields();
  return Object.values(fields).map((field) => getNamedType(field.type));
}

/**
 * 組み込み型かどうかを判定（__Schema, __Type など）
 */
export function isIntrospectionType(type: GraphQLNamedType): boolean {
  return type.name.startsWith("__");
}

/**
 * 標準スカラー型かどうかを判定
 */
export function isBuiltInScalar(type: GraphQLNamedType): boolean {
  const builtInScalars = ["String", "Int", "Float", "Boolean", "ID"];
  return TypeKind.isScalar(type) && builtInScalars.includes(type.name);
}
