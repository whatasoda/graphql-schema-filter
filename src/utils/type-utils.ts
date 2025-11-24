/**
 * GraphQL 型システムを扱うためのユーティリティ関数
 */

import {
  GraphQLNamedType,
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
} from "graphql";

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
  isEnum: (type: GraphQLNamedType): type is GraphQLEnumType => isEnumType(type),
  isScalar: (type: GraphQLNamedType): type is GraphQLScalarType =>
    isScalarType(type),
} as const;

/**
 * 標準スカラー型かどうかを判定
 */
export function isBuiltInScalar(type: GraphQLNamedType): boolean {
  const builtInScalars = ["String", "Int", "Float", "Boolean", "ID"];
  return TypeKind.isScalar(type) && builtInScalars.includes(type.name);
}
