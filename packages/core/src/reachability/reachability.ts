/**
 * Type reachability closure algorithm
 *
 * Collects all types transitively referenced from specified entry points
 * (Query/Mutation fields, Object types)
 */

import { GraphQLNamedType, GraphQLSchema } from "graphql";
import type { SchemaAnalysis } from "../types";
import { traverseGraphQLType } from "./traverse";
import { logger } from "../utils/logger";

/**
 * Determines whether the specified target can access a field
 *
 * Rules:
 * - If the field has @expose, decision is based on its target list
 * - If the field has no @expose:
 *   - Query/Mutation/Subscription types: not exposed (excluded)
 *   - Types with @disableAutoExpose: not exposed (excluded)
 *   - Other output types: exposed (default public)
 *
 * @param analysis - Parsed @expose directive information
 * @param typeName - Type name
 * @param fieldName - Field name
 * @param target - Target name
 * @returns true if the field is exposed
 */
export function isFieldExposed({
  analysis,
  typeName,
  fieldName,
  target,
}: {
  analysis: SchemaAnalysis;
  typeName: string;
  fieldName: string;
  target: string;
}): boolean {
  const exposureInfo = analysis.exposureInfoMap.get(typeName);
  if (!exposureInfo) {
    return false;
  }

  // Check field-level @expose
  const field = exposureInfo.fields.get(fieldName);
  if (field !== undefined) {
    return field.tags.includes(target);
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
 * Generator that yields reachable type names
 *
 * @param schema - GraphQL schema
 * @param target - Target identifier
 * @param analysis - Parsed @expose directive results
 * @yields Reachable type names
 *
 * @remarks
 * Uses BFS algorithm to yield all type names transitively referenced from
 * entry points. Types referenced through fields not exposed to the target
 * are considered unreachable.
 *
 * @public
 * Advanced API: Using the generator directly enables early termination
 * and lazy evaluation. For typical use cases, use `computeReachability`.
 */
export function traverseReachableTypes({
  schema,
  target,
  analysis,
}: {
  schema: GraphQLSchema;
  target: string;
  analysis: SchemaAnalysis;
}): Generator<GraphQLNamedType> {
  const entrypoints = Object.values(analysis.rootTypeNames)
    .map((typeName) => (typeName ? schema.getType(typeName) : null))
    .filter((type) => type != null);

  return traverseGraphQLType({
    schema,
    entrypoints,
    filter: (output) => {
      if (output.source === "objectField") {
        return isFieldExposed({
          analysis,
          typeName: output.typeName,
          fieldName: output.fieldName,
          target,
        });
      }

      if (
        output.source === "interfaceField" ||
        output.source === "inputField" ||
        output.source === "interfaceImplementedByObject" ||
        output.source === "objectImplementingInterface" ||
        output.source === "unionMember"
      ) {
        return true;
      }

      throw new Error(`Unsupported output source: ${output satisfies never}`);
    },
  });
}

/**
 * Computes type reachability
 *
 * @param schema - GraphQL schema
 * @param target - Target identifier
 * @param analysis - Parsed @expose directive results
 * @returns Set of reachable type names
 *
 * @remarks
 * Uses BFS algorithm to collect all types transitively referenced from
 * entry points. Uses a generator internally, but the external API is
 * a pure function that returns a regular Set.
 * Types referenced through fields not exposed to the target are considered unreachable.
 */
export function computeReachability(
  schema: GraphQLSchema,
  target: string,
  analysis: SchemaAnalysis
): Set<string> {
  const reachableTypes = new Set<string>(
    Array.from(traverseReachableTypes({ schema, target, analysis })).map(
      (type) => {
        logger.debug(`[Reachability] Discovered type: ${type.name}`);
        return type.name;
      }
    )
  );

  logger.debug(
    `[Reachability] Traversal complete. Total types discovered: ${reachableTypes.size}`
  );

  return reachableTypes;
}
