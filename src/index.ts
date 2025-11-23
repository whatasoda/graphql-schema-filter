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
  analyzeReachability,
  traverseObjectOrInterface,
  traverseUnion,
  traverseInputObject,
  traverseType,
  getRootType,
  addRootField,
  addTypeToQueue,
} from "./analyzer/reachability";

// Schema Filter関連の純粋関数
export {
  buildFilteredSchema,
  buildFilteredTypeMap,
  buildRootType,
  filterType,
  filterObjectType,
  filterInterfaceType,
  filterInputObjectType,
  filterObjectFields,
  filterInterfaceFields,
  filterInputObjectFields,
  convertFieldToConfig,
  replaceTypeReferences,
} from "./filter/schema-filter";

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
