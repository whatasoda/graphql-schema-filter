import { SchemaFilterOptions, validateSchemaFilterOptions } from "./options";
import { createDocumentCollector } from "./collect-documents/collect-documents";
import { buildASTSchema, parse } from "graphql";
import { stripUnknownDirectives } from "./strip-unknown-directives/strip-unknown-directives";
import { filterSchema, FilterSchemaOptions } from "@graphql-schema-filter/core";

export function createSchemaFilter(options: SchemaFilterOptions) {
  validateSchemaFilterOptions(options);

  const documentCollector = createDocumentCollector(
    {
      patterns: options.patterns,
      globOptions: options.globOptions,
      fileReadConcurrency: 10,
    },
    (raw) => parse(raw)
  );

  return {
    async getSourceAst() {
      return await documentCollector.collect();
    },

    async getFilteredSchema(filterOptions: FilterSchemaOptions) {
      const documentResult = await documentCollector.collect();

      if (documentResult.type === "error") {
        throw documentResult.error;
      }

      const schemaAst = stripUnknownDirectives({
        ast: documentResult.parsed,
        extraDirectivesToKeep: new Set(["expose", "disableAutoExpose"]),
      });

      return filterSchema(buildASTSchema(schemaAst), {
        target: filterOptions.target,
        logLevel: filterOptions.logLevel,
      });
    },
  };
}
