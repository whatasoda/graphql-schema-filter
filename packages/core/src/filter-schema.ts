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
import {
  validateFilterSchemaOptions,
  type FilterSchemaOptions,
} from "./options";
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
 */
export function filterSchema(
  schema: GraphQLSchema,
  options: FilterSchemaOptions
): GraphQLSchema {
  validateFilterSchemaOptions(options);

  const { target, logLevel = "none" } = options;
  logger.setLogLevel(logLevel);

  // Phase 1 [Schema Analysis]: Extract @expose directives (Schema API)
  const analysis = createSchemaAnalysis(schema);

  // DEBUG: Output parse results (enabled with LOG_LEVEL=debug)
  debugSchemaAnalysis(analysis);

  // Phase 2 [Reachability]: Compute reachable types via BFS (Schema API)
  const reachableTypes = computeReachability(schema, target, analysis);

  logger.info(`Reachable types: ${reachableTypes.size}`);

  // Phase 3 [AST Conversion]: Convert Schema to SDL → AST
  const sdl = printSchema(schema);
  const ast = parse(sdl);

  // Phase 4 [AST Filtering]: Filter AST definitions by reachability and expose rules
  const filteredDefinitions = filterDefinitionsAST(
    ast,
    target,
    reachableTypes,
    analysis
  );

  // Phase 5 [Schema Building]: Build new schema from filtered AST
  const filteredSchema = buildASTSchema({
    kind: Kind.DOCUMENT,
    definitions: filteredDefinitions,
  });

  logger.info(`Filtered schema created for target "${target}"`);

  return filteredSchema;
}
