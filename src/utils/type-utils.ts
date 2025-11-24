/**
 * GraphQL 型システムを扱うためのユーティリティ関数
 */

import { GraphQLNamedType, isScalarType } from "graphql";

/**
 * 標準スカラー型かどうかを判定
 */
export function isBuiltInScalar(type: GraphQLNamedType): boolean {
  const builtInScalars = ["String", "Int", "Float", "Boolean", "ID"];
  return isScalarType(type) && builtInScalars.includes(type.name);
}
