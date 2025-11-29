/**
 * AST-based schema filtering
 */

import type {
  DocumentNode,
  DefinitionNode,
  ObjectTypeDefinitionNode,
  InterfaceTypeDefinitionNode,
  InputObjectTypeDefinitionNode,
  UnionTypeDefinitionNode,
  FieldDefinitionNode,
  InputValueDefinitionNode,
} from "graphql";
import type { SchemaAnalysis } from "../types";

/**
 * Determines whether the specified target can access a field from AST FieldDefinitionNode
 *
 * @param typeName - Parent type name
 * @param field - Field definition AST node
 * @param analysis - SchemaAnalysis information
 * @param target - Target name
 * @returns true if the field is exposed
 *
 * @remarks
 * Rules:
 * - If the field has @expose, decision is based on its target list
 * - If the field has no @expose:
 *   - Query/Mutation/Subscription types: not exposed (excluded)
 *   - Types with @disableAutoExpose: not exposed (excluded)
 *   - Other output types: exposed (default public)
 */
export function isFieldExposedFromAST({
  typeName,
  field,
  analysis,
  target,
}: {
  typeName: string;
  field: FieldDefinitionNode | InputValueDefinitionNode;
  analysis: SchemaAnalysis;
  target: string;
}): boolean {
  const exposureInfo = analysis.exposureInfoMap.get(typeName);
  if (!exposureInfo) {
    return false;
  }

  // Check field-level @expose
  const fieldInfo = exposureInfo.fields.get(field.name.value);
  if (fieldInfo !== undefined) {
    return fieldInfo.tags.includes(target);
  }

  // Decision when no @expose is present
  // Root types or types with @disableAutoExpose are excluded
  if (exposureInfo.isRootType || exposureInfo.isAutoExposeDisabled) {
    return false;
  }

  // Other output types are exposed by default
  return true;
}

/**
 * Filters fields of ObjectTypeDefinition
 *
 * @param typeDef - Object type definition AST node
 * @param analysis - Parsed @expose directive information
 * @param target - Target identifier
 * @returns Filtered field array
 */
function filterObjectFields(
  typeDef: ObjectTypeDefinitionNode,
  analysis: SchemaAnalysis,
  target: string
): readonly FieldDefinitionNode[] | undefined {
  if (!typeDef.fields) {
    return undefined;
  }

  // exposed-only: Filter based on @expose rules
  return typeDef.fields.filter((field) =>
    isFieldExposedFromAST({
      typeName: typeDef.name.value,
      field,
      analysis,
      target,
    })
  );
}

/**
 * Filters fields of InterfaceTypeDefinition
 *
 * @param typeDef - Interface type definition AST node
 * @param analysis - Parsed @expose directive information
 * @param target - Target identifier
 * @returns Filtered field array
 */
function filterInterfaceFields(
  typeDef: InterfaceTypeDefinitionNode,
  analysis: SchemaAnalysis,
  target: string
): readonly FieldDefinitionNode[] | undefined {
  if (!typeDef.fields) {
    return undefined;
  }

  // exposed-only: Filter based on @expose rules
  return typeDef.fields.filter((field) =>
    isFieldExposedFromAST({
      typeName: typeDef.name.value,
      field,
      analysis,
      target,
    })
  );
}

/**
 * Filters fields of InputObjectTypeDefinition
 *
 * @param typeDef - InputObject type definition AST node
 * @param analysis - Parsed @expose directive information
 * @param target - Target identifier
 * @returns Filtered field array
 *
 * @remarks
 * InputObject uses permissive mode: included by default when no @expose is present
 */
function filterInputObjectFields(
  typeDef: InputObjectTypeDefinitionNode,
  analysis: SchemaAnalysis,
  target: string
): readonly InputValueDefinitionNode[] | undefined {
  if (!typeDef.fields) {
    return undefined;
  }

  return typeDef.fields.filter((field) =>
    isFieldExposedFromAST({
      typeName: typeDef.name.value,
      field,
      analysis,
      target,
    })
  );
}

/**
 * Filters ObjectTypeDefinition
 *
 * @param typeDef - Object type definition AST node
 * @param analysis - Parsed @expose directive information
 * @param target - Target identifier
 * @param reachableTypes - Set of reachable type names
 * @returns Filtered Object type definition, or null if fields are empty
 */
function filterObjectTypeDefinition(
  typeDef: ObjectTypeDefinitionNode,
  analysis: SchemaAnalysis,
  target: string,
  reachableTypes: Set<string>
): ObjectTypeDefinitionNode | null {
  const filteredFields = filterObjectFields(typeDef, analysis, target);

  // Remove type if fields are empty
  if (!filteredFields || filteredFields.length === 0) {
    return null;
  }

  // Keep only reachable implemented interfaces
  const filteredInterfaces = typeDef.interfaces?.filter((iface) =>
    reachableTypes.has(iface.name.value)
  );

  return {
    ...typeDef,
    fields: filteredFields,
    interfaces: filteredInterfaces,
  };
}

/**
 * Filters InterfaceTypeDefinition
 *
 * @param typeDef - Interface type definition AST node
 * @param analysis - Parsed @expose directive information
 * @param target - Target identifier
 * @param reachableTypes - Set of reachable type names
 * @returns Filtered Interface type definition, or null if fields are empty
 */
function filterInterfaceTypeDefinition(
  typeDef: InterfaceTypeDefinitionNode,
  analysis: SchemaAnalysis,
  target: string,
  reachableTypes: Set<string>
): InterfaceTypeDefinitionNode | null {
  const filteredFields = filterInterfaceFields(typeDef, analysis, target);

  // Remove type if fields are empty
  if (!filteredFields || filteredFields.length === 0) {
    return null;
  }

  // Keep only reachable implemented interfaces
  const filteredInterfaces = typeDef.interfaces?.filter((iface) =>
    reachableTypes.has(iface.name.value)
  );

  return {
    ...typeDef,
    fields: filteredFields,
    interfaces: filteredInterfaces,
  };
}

/**
 * Filters InputObjectTypeDefinition
 *
 * @param typeDef - InputObject type definition AST node
 * @param analysis - Parsed @expose directive information
 * @param target - Target identifier
 * @returns Filtered InputObject type definition, or null if fields are empty
 */
function filterInputObjectTypeDefinition(
  typeDef: InputObjectTypeDefinitionNode,
  analysis: SchemaAnalysis,
  target: string
): InputObjectTypeDefinitionNode | null {
  const filteredFields = filterInputObjectFields(typeDef, analysis, target);

  // Remove type if fields are empty
  if (!filteredFields || filteredFields.length === 0) {
    return null;
  }

  return {
    ...typeDef,
    fields: filteredFields,
  };
}

/**
 * Filters UnionTypeDefinition
 *
 * @param typeDef - Union type definition AST node
 * @param reachableTypes - Set of reachable type names
 * @returns Filtered Union type definition, or null if members are empty
 *
 * @remarks
 * Excludes union member types that are unreachable
 */
function filterUnionTypeDefinition(
  typeDef: UnionTypeDefinitionNode,
  reachableTypes: Set<string>
): UnionTypeDefinitionNode | null {
  if (!typeDef.types) {
    return null;
  }

  // Keep only reachable member types
  const filteredTypes = typeDef.types.filter((memberType) =>
    reachableTypes.has(memberType.name.value)
  );

  // Remove type if members are empty
  if (filteredTypes.length === 0) {
    return null;
  }

  return {
    ...typeDef,
    types: filteredTypes,
  };
}

/**
 * Filters definitions of DocumentNode
 *
 * @param documentNode - GraphQL AST DocumentNode
 * @param target - Target identifier
 * @param reachableTypes - Set of reachable type names
 * @param analysis - Parsed @expose directive information
 * @returns Filtered DefinitionNode array
 *
 * @remarks
 * Filters based on the following rules:
 * 1. Unreachable types are excluded
 * 2. Object/Interface/InputObject types are filtered at field level
 * 3. Scalar/Enum/Union types are included as-is if reachable
 * 4. Directive definitions are always included
 */
export function filterDefinitionsAST(
  documentNode: DocumentNode,
  target: string,
  reachableTypes: Set<string>,
  analysis: SchemaAnalysis
): DefinitionNode[] {
  return documentNode.definitions
    .map((def) => {
      // Include directive definitions as-is
      if (def.kind === "DirectiveDefinition") {
        return def;
      }

      // Exclude schema definition (buildASTSchema generates it automatically)
      if (def.kind === "SchemaDefinition") {
        return null;
      }

      // Include non-type definitions as-is
      if (
        def.kind !== "ObjectTypeDefinition" &&
        def.kind !== "InterfaceTypeDefinition" &&
        def.kind !== "InputObjectTypeDefinition" &&
        def.kind !== "UnionTypeDefinition" &&
        def.kind !== "EnumTypeDefinition" &&
        def.kind !== "ScalarTypeDefinition"
      ) {
        return def;
      }

      // Root types (Query/Mutation/Subscription) are always included (even if fields are empty)
      const isRootType =
        def.name.value === analysis.rootTypeNames.query ||
        def.name.value === analysis.rootTypeNames.mutation ||
        def.name.value === analysis.rootTypeNames.subscription;

      // Exclude unreachable types (except root types)
      if (!isRootType && !reachableTypes.has(def.name.value)) {
        return null;
      }

      // Field filtering for Object types
      if (def.kind === "ObjectTypeDefinition") {
        const filtered = filterObjectTypeDefinition(
          def,
          analysis,
          target,
          reachableTypes
        );

        // For root types, keep type definition even if fields are empty
        if (isRootType && filtered === null) {
          return {
            ...def,
            fields: [],
          };
        }

        return filtered;
      }

      // Field filtering for Interface types
      if (def.kind === "InterfaceTypeDefinition") {
        return filterInterfaceTypeDefinition(
          def,
          analysis,
          target,
          reachableTypes
        );
      }

      // Field filtering for InputObject types
      if (def.kind === "InputObjectTypeDefinition") {
        return filterInputObjectTypeDefinition(def, analysis, target);
      }

      // Member filtering for Union types
      if (def.kind === "UnionTypeDefinition") {
        return filterUnionTypeDefinition(def, reachableTypes);
      }

      // Include Scalar/Enum as-is
      return def;
    })
    .filter((def) => def != null);
}
