/**
 * Main schema filtering function
 *
 * Integrates reachability analyzer, @expose parser, and schema filter
 */

import {
  GraphQLSchema,
  printSchema,
  parse,
  buildASTSchema,
  Kind,
} from "graphql";
import type { FilterSchemaOptions } from "./types";
import {
  createSchemaAnalysis,
  debugSchemaAnalysis,
} from "./analysis/schema-analysis";
import { computeReachability } from "./reachability/reachability";
import { filterDefinitionsAST } from "./filter/ast-filter";
import { logger } from "./utils/logger";

/**
 * Filters a schema to generate a schema for the specified target
 *
 * @param schema - The original GraphQL schema
 * @param options - Filtering options
 * @returns The filtered GraphQL schema
 *
 * @remarks
 * Uses a 6-phase pipeline:
 * 1. Parse: Extract @expose directives (Schema API)
 * 2. Infer Entry Points: Determine entry points (auto-inference or explicit specification)
 * 3. Reachability: Compute reachable types via BFS (Schema API)
 * 4. AST Conversion: Convert Schema to SDL → AST
 * 5. AST Filtering: Filter AST definitions by reachability and expose rules
 * 6. Schema Building: Build new schema from filtered AST
 */
export function filterSchema(
  schema: GraphQLSchema,
  options: FilterSchemaOptions
): GraphQLSchema {
  // Validate input
  if (!options.target || typeof options.target !== "string") {
    throw new Error("target must be a non-empty string");
  }
  const { target } = options;

  // Phase 1: Parse @expose directives
  const analysis = createSchemaAnalysis(schema);

  // DEBUG: Output parse results (enabled with LOG_LEVEL=debug)
  debugSchemaAnalysis(analysis);

  // Phase 3: Compute reachable types
  const reachableTypes = computeReachability(schema, target, analysis);

  logger.info(`Reachable types: ${reachableTypes.size}`);

  // Phase 4: Convert Schema to AST
  const sdl = printSchema(schema);
  const ast = parse(sdl);

  // Phase 5: Filter AST
  const filteredDefinitions = filterDefinitionsAST(
    ast,
    target,
    reachableTypes,
    analysis
  );

  // Phase 6: Build new schema from filtered AST
  const filteredSchema = buildASTSchema({
    kind: Kind.DOCUMENT,
    definitions: filteredDefinitions,
  });

  logger.info(`Filtered schema created for target "${target}"`);

  return filteredSchema;
}
