import { DocumentNode, visit } from "graphql";

export type SortFieldsOptions = { type: "alphabetical" } | { type: "none" };

export function sortFields({
  documentNode,
  options,
}: {
  documentNode: DocumentNode;
  options: SortFieldsOptions;
}) {
  if (options.type === "none") {
    return documentNode;
  }

  if (options.type === "alphabetical") {
    return visit(documentNode, {
      ObjectTypeDefinition(node) {
        if (!node.fields) {
          return node;
        }

        return {
          ...node,
          fields: node.fields
            .slice()
            .sort((a, b) => a.name.value.localeCompare(b.name.value)),
        };
      },
      InterfaceTypeDefinition(node) {
        if (!node.fields) {
          return node;
        }

        return {
          ...node,
          fields: node.fields
            .slice()
            .sort((a, b) => a.name.value.localeCompare(b.name.value)),
        };
      },
      InputObjectTypeDefinition(node) {
        if (!node.fields) {
          return node;
        }

        return {
          ...node,
          fields: node.fields
            .slice()
            .sort((a, b) => a.name.value.localeCompare(b.name.value)),
        };
      },
    });
  }

  throw new Error(
    `Unsupported sort fields options: ${options satisfies never}`
  );
}
