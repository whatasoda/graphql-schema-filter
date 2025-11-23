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

// 純粋関数（旧クラスの代替）
export {
  parseExposeDirectives,
  isFieldExposed,
  getExposedFields,
  debugExposeDirectives,
} from "./parser/expose-parser";

export { computeReachability, analyzeReachability } from "./analyzer/reachability";

export { buildFilteredSchema } from "./filter/schema-filter";

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
  EntryPoints,
  ParsedExposeDirectives,
  ReachabilityConfig,
  SchemaFilterConfig,
  FilterSchemaOptions,
} from "./types";
