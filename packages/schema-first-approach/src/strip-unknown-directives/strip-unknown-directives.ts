import { DocumentNode, visit } from "graphql";

function collectDefinedDirectives({ ast }: { ast: DocumentNode }): Set<string> {
  const definedDirectives = new Set<string>();

  visit(ast, {
    DirectiveDefinition(node) {
      definedDirectives.add(node.name.value);
      return undefined;
    },
  });

  return definedDirectives;
}

/**
 * strip unknown directives from AST
 * @param ast - AST to strip unknown directives from
 * @param extraDirectivesToKeep - extra directives to keep
 * @returns AST with unknown directives stripped
 */
export function stripUnknownDirectives({
  ast,
  extraDirectivesToKeep,
}: {
  ast: DocumentNode;
  extraDirectivesToKeep: Set<string>;
}): DocumentNode {
  const definedDirectives = collectDefinedDirectives({ ast });

  return visit(ast, {
    Directive(node) {
      if (
        !definedDirectives.has(node.name.value) &&
        !extraDirectivesToKeep.has(node.name.value)
      ) {
        return null;
      }
      return undefined;
    },
  });
}
