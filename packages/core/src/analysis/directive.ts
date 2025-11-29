import { ConstDirectiveNode, Kind } from "graphql";

/**
 * Extracts @expose directive tags from AST node
 * @returns tags array if directive exists, undefined otherwise
 */
export function extractExposureTags({
  directives,
}: {
  directives: readonly ConstDirectiveNode[] | undefined;
}): readonly string[] | null {
  if (!directives) {
    return null;
  }

  const aggregation = directives.map((directive): { tags: string[] } | null => {
    if (directive.name.value !== "expose") {
      return null;
    }

    const tagsArg = directive.arguments?.find(
      (arg) => arg.name.value === "tags"
    );
    if (!tagsArg || tagsArg.value.kind !== Kind.LIST) {
      return null;
    }

    const tags = tagsArg.value.values
      .map((v) => (v.kind === Kind.STRING ? v.value : null))
      .filter((v) => v !== null);

    return { tags };
  });

  return aggregation.length === 0
    ? null
    : Array.from(new Set(aggregation.flatMap((t) => t?.tags ?? [])));
}

export function hasDisableAutoExposeDirective({
  directives,
}: {
  directives: readonly ConstDirectiveNode[] | undefined;
}): boolean {
  if (!directives) {
    return false;
  }

  return directives.some(
    (directive) => directive.name.value === "disableAutoExpose"
  );
}
