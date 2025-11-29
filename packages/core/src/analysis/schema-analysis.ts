/**
 * Parsing and application rule resolution for @expose directive
 */

import {
  GraphQLSchema,
  isObjectType,
  isInterfaceType,
  isInputObjectType,
  isIntrospectionType,
} from "graphql";
import type { SchemaAnalysis, TypeLevelExposureInfo } from "../types";
import {
  createExposureInfoFromObjectType,
  createExposureInfoFromInterfaceType,
  createExposureInfoFromInputObjectType,
} from "./exposure-info";
import { logger } from "../utils/logger";

/**
 * Parses @expose directives from schema
 *
 * @param schema - GraphQL schema
 * @returns Parsed @expose directive information
 */
export function createSchemaAnalysis(schema: GraphQLSchema): SchemaAnalysis {
  // Get root type names
  const rootTypeNames = {
    query: schema.getQueryType()?.name ?? null,
    mutation: schema.getMutationType()?.name ?? null,
    subscription: schema.getSubscriptionType()?.name ?? null,
  };

  // Set of root type names (for fast lookup)
  const rootTypeNameSet = new Set<string>(
    [
      rootTypeNames.query,
      rootTypeNames.mutation,
      rootTypeNames.subscription,
    ].filter((name) => name !== null)
  );

  const exposureInfoList = Object.values(
    schema.getTypeMap()
  ).flatMap<TypeLevelExposureInfo>((type) => {
    if (isIntrospectionType(type)) return [];

    if (isObjectType(type)) {
      return createExposureInfoFromObjectType({ type, rootTypeNameSet }) ?? [];
    }

    if (isInterfaceType(type)) {
      return createExposureInfoFromInterfaceType({ type }) ?? [];
    }

    if (isInputObjectType(type)) {
      return createExposureInfoFromInputObjectType({ type }) ?? [];
    }

    return [];
  });

  return {
    rootTypeNames,
    exposureInfoMap: new Map(
      exposureInfoList.map((info) => [info.typeName, info])
    ),
  };
}

/**
 * Debug: outputs all @expose information
 *
 * @param analysis - SchemaAnalysis information
 */
export function debugSchemaAnalysis(analysis: SchemaAnalysis): void {
  logger.debug("=== Root Types ===");
  logger.debug(`  Query: ${analysis.rootTypeNames.query ?? "(none)"}`);
  logger.debug(`  Mutation: ${analysis.rootTypeNames.mutation ?? "(none)"}`);
  logger.debug(
    `  Subscription: ${analysis.rootTypeNames.subscription ?? "(none)"}`
  );

  logger.debug("\n=== Types with @disableAutoExpose ===");
  const disabledTypes = Array.from(analysis.exposureInfoMap.values()).filter(
    (info) => info.isAutoExposeDisabled
  );
  if (disabledTypes.length === 0) {
    logger.debug("  (none)");
  } else {
    for (const info of disabledTypes) {
      logger.debug(`  ${info.typeName}`);
    }
  }

  logger.debug("\n=== Field-level @expose ===");
  let hasExposedFields = false;
  for (const [typeName, typeInfo] of analysis.exposureInfoMap.entries()) {
    for (const [fieldName, fieldInfo] of typeInfo.fields.entries()) {
      hasExposedFields = true;
      logger.debug(`${typeName}.${fieldName}: [${fieldInfo.tags.join(", ")}]`);
    }
  }
  if (!hasExposedFields) {
    logger.debug("  (none)");
  }
}
