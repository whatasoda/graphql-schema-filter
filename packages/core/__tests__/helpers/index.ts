export {
  // Result types
  type TypeCheckResult,
  type FieldCheckResult,
  type InterfaceCheckResult,
  // Data getters
  getVisibleTypeNames,
  getFieldNames,
  getQueryFieldNames,
  getMutationFieldNames,
  getInterfaceNames,
  // Check functions
  checkType,
  checkField,
  checkInterface,
  // Schema string checks
  schemaContains,
} from "./schema-assertions";
