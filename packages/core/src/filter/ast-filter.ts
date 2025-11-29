/**
 * AST-based schema filtering using GraphQL's visit() function
 */

import {
  visit,
  type DocumentNode,
  type DefinitionNode,
  type ObjectTypeDefinitionNode,
  type InterfaceTypeDefinitionNode,
  type InputObjectTypeDefinitionNode,
  type UnionTypeDefinitionNode,
  type EnumTypeDefinitionNode,
  type ScalarTypeDefinitionNode,
  type FieldDefinitionNode,
  type InputValueDefinitionNode,
  type ASTVisitor,
} from "graphql";
import type { SchemaAnalysis } from "../types";

/**
 * Context for the AST filter visitor
 */
interface FilterVisitorContext {
  target: string;
  reachableTypes: Set<string>;
  analysis: SchemaAnalysis;
}

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
 * Checks if the given type name is a root type (Query/Mutation/Subscription)
 */
function isRootTypeName(typeName: string, analysis: SchemaAnalysis): boolean {
  const { query, mutation, subscription } = analysis.rootTypeNames;
  return (
    typeName === query || typeName === mutation || typeName === subscription
  );
}

/**
 * Filters fields based on exposure rules
 */
function filterFields<T extends FieldDefinitionNode | InputValueDefinitionNode>(
  typeName: string,
  fields: readonly T[] | undefined,
  context: FilterVisitorContext
): readonly T[] | undefined {
  if (!fields) {
    return undefined;
  }

  return fields.filter((field) =>
    isFieldExposedFromAST({
      typeName,
      field,
      analysis: context.analysis,
      target: context.target,
    })
  );
}

/**
 * Filters reachable interface implementations
 */
function filterInterfaces(
  interfaces: ObjectTypeDefinitionNode["interfaces"],
  reachableTypes: Set<string>
): ObjectTypeDefinitionNode["interfaces"] {
  return interfaces?.filter((iface) => reachableTypes.has(iface.name.value));
}

/**
 * Visitor for ObjectTypeDefinition nodes
 */
function visitObjectType(
  node: ObjectTypeDefinitionNode,
  context: FilterVisitorContext
): ObjectTypeDefinitionNode | null {
  const typeName = node.name.value;
  const isRootType = isRootTypeName(typeName, context.analysis);

  // Exclude unreachable non-root types
  if (!isRootType && !context.reachableTypes.has(typeName)) {
    return null;
  }

  const filteredFields = filterFields(typeName, node.fields, context);
  const filteredInterfaces = filterInterfaces(
    node.interfaces,
    context.reachableTypes
  );

  // Handle empty fields case
  if (!filteredFields || filteredFields.length === 0) {
    // Root types keep empty definition
    if (isRootType) {
      return { ...node, fields: [], interfaces: filteredInterfaces };
    }
    return null;
  }

  return { ...node, fields: filteredFields, interfaces: filteredInterfaces };
}

/**
 * Visitor for InterfaceTypeDefinition nodes
 */
function visitInterfaceType(
  node: InterfaceTypeDefinitionNode,
  context: FilterVisitorContext
): InterfaceTypeDefinitionNode | null {
  const typeName = node.name.value;

  // Exclude unreachable types
  if (!context.reachableTypes.has(typeName)) {
    return null;
  }

  const filteredFields = filterFields(typeName, node.fields, context);
  const filteredInterfaces = filterInterfaces(
    node.interfaces,
    context.reachableTypes
  );

  // Remove type if fields are empty
  if (!filteredFields || filteredFields.length === 0) {
    return null;
  }

  return { ...node, fields: filteredFields, interfaces: filteredInterfaces };
}

/**
 * Visitor for InputObjectTypeDefinition nodes
 */
function visitInputObjectType(
  node: InputObjectTypeDefinitionNode,
  context: FilterVisitorContext
): InputObjectTypeDefinitionNode | null {
  const typeName = node.name.value;

  // Exclude unreachable types
  if (!context.reachableTypes.has(typeName)) {
    return null;
  }

  const filteredFields = filterFields(typeName, node.fields, context);

  // Remove type if fields are empty
  if (!filteredFields || filteredFields.length === 0) {
    return null;
  }

  return { ...node, fields: filteredFields };
}

/**
 * Visitor for UnionTypeDefinition nodes
 */
function visitUnionType(
  node: UnionTypeDefinitionNode,
  context: FilterVisitorContext
): UnionTypeDefinitionNode | null {
  const typeName = node.name.value;

  // Exclude unreachable types
  if (!context.reachableTypes.has(typeName)) {
    return null;
  }

  if (!node.types) {
    return null;
  }

  // Keep only reachable member types
  const filteredTypes = node.types.filter((memberType) =>
    context.reachableTypes.has(memberType.name.value)
  );

  // Remove type if members are empty
  if (filteredTypes.length === 0) {
    return null;
  }

  return { ...node, types: filteredTypes };
}

/**
 * Visitor for simple type definitions (Enum/Scalar)
 */
function visitSimpleType(
  node: EnumTypeDefinitionNode | ScalarTypeDefinitionNode,
  context: FilterVisitorContext
): EnumTypeDefinitionNode | ScalarTypeDefinitionNode | null {
  // Exclude unreachable types
  if (!context.reachableTypes.has(node.name.value)) {
    return null;
  }

  return node;
}

/**
 * Creates an AST visitor for filtering definitions
 */
function createFilterVisitor(context: FilterVisitorContext): ASTVisitor {
  return {
    // Remove schema definition (buildASTSchema generates it automatically)
    SchemaDefinition: () => null,

    // Keep directive definitions as-is
    DirectiveDefinition: () => undefined,

    ObjectTypeDefinition: {
      enter: (node) => visitObjectType(node, context),
    },

    InterfaceTypeDefinition: {
      enter: (node) => visitInterfaceType(node, context),
    },

    InputObjectTypeDefinition: {
      enter: (node) => visitInputObjectType(node, context),
    },

    UnionTypeDefinition: {
      enter: (node) => visitUnionType(node, context),
    },

    EnumTypeDefinition: {
      enter: (node) => visitSimpleType(node, context),
    },

    ScalarTypeDefinition: {
      enter: (node) => visitSimpleType(node, context),
    },
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
  const context: FilterVisitorContext = {
    target,
    reachableTypes,
    analysis,
  };

  const filteredDocument = visit(documentNode, createFilterVisitor(context));

  return [...filteredDocument.definitions];
}
