import { DefinitionNode, DocumentNode, Kind, visit } from "graphql";
import { SchemaAnalysis } from "../types";

export type DefinitionsSortOptions =
  | { type: "alphabetical" }
  | { type: "none" };

const GROUP_ORDER = {
  schema: 0,
  root_types: 1,
  scalars: 2,
  directives: 3,
  named_types: 4,
} as const;

interface NodeWithSortKey {
  group: keyof typeof GROUP_ORDER;
  sortKey: string;
  node: DefinitionNode;
}

function attachSortKeyToDefinitionNode({
  node,
  rootTypeNames,
}: {
  node: DefinitionNode;
  rootTypeNames: SchemaAnalysis["rootTypeNames"];
}): NodeWithSortKey | null {
  // NOTE: Definitions of operation and fragment are not included in schema definition.
  if (
    node.kind === Kind.OPERATION_DEFINITION ||
    node.kind === Kind.FRAGMENT_DEFINITION
  ) {
    return null;
  }

  // NOTE: Extension nodes should not be included at format phase.
  if (
    node.kind === Kind.SCHEMA_EXTENSION ||
    node.kind === Kind.ENUM_TYPE_EXTENSION ||
    node.kind === Kind.UNION_TYPE_EXTENSION ||
    node.kind === Kind.OBJECT_TYPE_EXTENSION ||
    node.kind === Kind.SCALAR_TYPE_EXTENSION ||
    node.kind === Kind.INTERFACE_TYPE_EXTENSION ||
    node.kind === Kind.INPUT_OBJECT_TYPE_EXTENSION
  ) {
    return null;
  }

  if (node.kind === Kind.SCHEMA_DEFINITION) {
    return { group: "schema", sortKey: "0", node };
  }

  if (node.kind === Kind.OBJECT_TYPE_DEFINITION) {
    const typeName = node.name.value;

    if (rootTypeNames.query === typeName) {
      return { group: "root_types", sortKey: "0_query", node };
    }

    if (rootTypeNames.mutation === typeName) {
      return { group: "root_types", sortKey: "1_mutation", node };
    }

    if (rootTypeNames.subscription === typeName) {
      return { group: "root_types", sortKey: "2_subscription", node };
    }

    return { group: "named_types", sortKey: typeName, node };
  }

  if (node.kind === Kind.DIRECTIVE_DEFINITION) {
    return { group: "directives", sortKey: node.name.value, node };
  }

  if (node.kind === Kind.SCALAR_TYPE_DEFINITION) {
    return { group: "scalars", sortKey: node.name.value, node };
  }

  if (node.kind === Kind.INTERFACE_TYPE_DEFINITION) {
    return { group: "named_types", sortKey: node.name.value, node };
  }

  if (node.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION) {
    return { group: "named_types", sortKey: node.name.value, node };
  }

  if (node.kind === Kind.UNION_TYPE_DEFINITION) {
    return { group: "named_types", sortKey: node.name.value, node };
  }

  if (node.kind === Kind.ENUM_TYPE_DEFINITION) {
    return { group: "named_types", sortKey: node.name.value, node };
  }

  throw new Error(`Unsupported node kind: ${node satisfies never}`);
}

export function sortDefinitions({
  documentNode,
  rootTypeNames,
  options,
}: {
  documentNode: DocumentNode;
  rootTypeNames: SchemaAnalysis["rootTypeNames"];
  options: DefinitionsSortOptions;
}) {
  if (options.type === "none") {
    return documentNode;
  }

  if (options.type === "alphabetical") {
    return visit(documentNode, {
      Document(node) {
        return {
          ...node,
          definitions: node.definitions
            .flatMap(
              (node) =>
                attachSortKeyToDefinitionNode({ node, rootTypeNames }) ?? []
            )
            .sort(
              (a, b) =>
                GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
                a.sortKey.localeCompare(b.sortKey)
            )
            .map((item) => item.node),
        };
      },
    });
  }

  throw new Error(
    `Unsupported sort definitions options: ${options satisfies never}`
  );
}
