import { DocumentNode, print } from "graphql";
import { SchemaAnalysis } from "../types";
import { sortFields, SortFieldsOptions } from "./sort-fields";
import { sortDefinitions } from "./sort-definitions";
import { DefinitionsSortOptions } from "./sort-definitions";

export interface FormatSchemaOptions {
  definitionsSort: DefinitionsSortOptions;
  fieldsSort: SortFieldsOptions;
}

export function formatSchema({
  documentNode,
  rootTypeNames,
  options,
}: {
  documentNode: DocumentNode;
  rootTypeNames: SchemaAnalysis["rootTypeNames"];
  options: FormatSchemaOptions;
}) {
  const fieldsSorted = sortFields({
    documentNode,
    options: options.fieldsSort,
  });

  const definitionsSorted = sortDefinitions({
    documentNode: fieldsSorted,
    rootTypeNames,
    options: options.definitionsSort,
  });

  return definitionsSorted;
}
