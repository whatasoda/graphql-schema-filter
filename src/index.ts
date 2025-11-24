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
  parseExposeDirectives,
  isFieldExposed,
  getExposedFields,
  debugExposeDirectives,
} from "./parser/expose-parser";

// Reachability関連の純粋関数
export {
  computeReachability,
  traverseReachableTypes,
} from "./analyzer/reachability";

// AST Filter関連の純粋関数
export { filterDefinitionsAST } from "./filter/ast-filter";

// AST ユーティリティ
export {
  getTypeNameFromTypeNode,
  isRootTypeName,
  isFieldExposedFromAST,
  isInputFieldExposedFromAST,
} from "./utils/ast-utils";

// ユーティリティ
export { isBuiltInScalar } from "./utils/type-utils";

// 型定義
export type {
  ParsedExposeDirectives,
  ReachabilityConfig,
  SchemaFilterConfig,
  FilterSchemaOptions,
} from "./types";
