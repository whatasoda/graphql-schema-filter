/**
 * GraphQL Schema Extract
 *
 * A library for filtering GraphQL schemas based on @expose directive.
 * Supports role-based access control with type reachability analysis.
 *
 * @packageDocumentation
 */

// メイン関数
export { filterSchemaForRole } from "./filter/filter-schema";

// 主要クラス
export { ReachabilityAnalyzer } from "./analyzer/reachability";
export { ExposeParser } from "./parser/expose-parser";
export { SchemaFilter } from "./filter/schema-filter";

// ユーティリティ
export {
  getNamedType,
  TypeKind,
  getArgumentTypes,
  getInputFieldTypes,
  isIntrospectionType,
  isBuiltInScalar,
} from "./utils/type-utils";

// 型定義
export type {
  ReachabilityConfig,
  SchemaFilterConfig,
  FilterSchemaOptions,
} from "./types";
