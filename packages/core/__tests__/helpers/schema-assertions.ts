import type { GraphQLSchema, GraphQLInterfaceType } from "graphql";
import { printSchema } from "graphql";

// ============================================================================
// Result Types
// ============================================================================

export type TypeCheckResult = "exists" | "not-found";
export type FieldCheckResult = "exists" | "type-not-found" | "field-not-found";
export type InterfaceCheckResult =
  | "implements"
  | "type-not-found"
  | "not-implemented";

// ============================================================================
// Data Getters
// ============================================================================

/**
 * Get all non-introspection type names from a schema.
 */
export function getVisibleTypeNames(schema: GraphQLSchema): string[] {
  return Object.keys(schema.getTypeMap()).filter(
    (name) => !name.startsWith("__")
  );
}

/**
 * Get field names for a given type.
 * Returns empty array if type doesn't exist or has no fields.
 */
export function getFieldNames(
  schema: GraphQLSchema,
  typeName: string
): string[] {
  const type = schema.getType(typeName);
  if (!type) return [];
  if ("getFields" in type && typeof type.getFields === "function") {
    return Object.keys(type.getFields());
  }
  return [];
}

/**
 * Get Query type field names.
 * Returns empty array if Query type doesn't exist.
 */
export function getQueryFieldNames(schema: GraphQLSchema): string[] {
  const queryType = schema.getQueryType();
  if (!queryType) return [];
  return Object.keys(queryType.getFields());
}

/**
 * Get Mutation type field names.
 * Returns empty array if Mutation type doesn't exist.
 */
export function getMutationFieldNames(schema: GraphQLSchema): string[] {
  const mutationType = schema.getMutationType();
  if (!mutationType) return [];
  return Object.keys(mutationType.getFields());
}

/**
 * Get interface names that a type implements.
 * Returns empty array if type doesn't exist or doesn't implement interfaces.
 */
export function getInterfaceNames(
  schema: GraphQLSchema,
  typeName: string
): string[] {
  const type = schema.getType(typeName);
  if (!type) return [];
  if ("getInterfaces" in type && typeof type.getInterfaces === "function") {
    return (type.getInterfaces() as GraphQLInterfaceType[]).map((i) => i.name);
  }
  return [];
}

// ============================================================================
// Check Functions (return string literals for detailed failure reasons)
// ============================================================================

/**
 * Check if a type exists in the schema.
 */
export function checkType(
  schema: GraphQLSchema,
  typeName: string
): TypeCheckResult {
  const type = schema.getType(typeName);
  return type ? "exists" : "not-found";
}

/**
 * Check if a field exists on a type.
 * Returns detailed reason if not found.
 */
export function checkField(
  schema: GraphQLSchema,
  typeName: string,
  fieldName: string
): FieldCheckResult {
  const type = schema.getType(typeName);
  if (!type) return "type-not-found";

  if (!("getFields" in type) || typeof type.getFields !== "function") {
    return "type-not-found";
  }

  const fields = type.getFields();
  return fieldName in fields ? "exists" : "field-not-found";
}

/**
 * Check if a type implements a specific interface.
 */
export function checkInterface(
  schema: GraphQLSchema,
  typeName: string,
  interfaceName: string
): InterfaceCheckResult {
  const type = schema.getType(typeName);
  if (!type) return "type-not-found";

  if (!("getInterfaces" in type) || typeof type.getInterfaces !== "function") {
    return "type-not-found";
  }

  const interfaces = (type.getInterfaces() as GraphQLInterfaceType[]).map(
    (i) => i.name
  );
  return interfaces.includes(interfaceName) ? "implements" : "not-implemented";
}

// ============================================================================
// Schema String Checks
// ============================================================================

/**
 * Check if the printed schema contains a specific fragment.
 */
export function schemaContains(
  schema: GraphQLSchema,
  fragment: string
): boolean {
  const schemaStr = printSchema(schema);
  return schemaStr.includes(fragment);
}
