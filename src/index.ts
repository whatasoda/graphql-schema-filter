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

// Parser関連の純粋関数
export {
  createSchemaAnalysis,
  debugSchemaAnalysis,
} from "./parser/expose-parser";

// Reachability関連の純粋関数
export {
  computeReachability,
  traverseReachableTypes,
} from "./analyzer/reachability";

// AST Filter関連の純粋関数
export { filterDefinitionsAST } from "./filter/ast-filter";

// 型定義
export type {
  SchemaAnalysis,
  TypeLevelExposureInfo,
  FieldLevelExposureInfo,
  FilterSchemaOptions,
} from "./types";
