import { describe, test, expect } from "bun:test";
import { parse, print } from "graphql";
import { stripUnknownDirectives } from "../../src/strip-unknown-directives/strip-unknown-directives";

describe("stripUnknownDirectives", () => {
  test("removes directives that are not defined in the schema", () => {
    const ast = parse(`
      type Query {
        users: [User!]! @unknownDirective
      }

      type User {
        id: ID!
      }
    `);

    const result = stripUnknownDirectives({
      ast,
      extraDirectivesToKeep: new Set(),
    });

    const printed = print(result);
    expect(printed).not.toContain("@unknownDirective");
    expect(printed).toContain("users: [User!]!");
  });

  test("keeps directives that are defined in the schema", () => {
    const ast = parse(`
      directive @myDirective on FIELD_DEFINITION

      type Query {
        users: [User!]! @myDirective
      }

      type User {
        id: ID!
      }
    `);

    const result = stripUnknownDirectives({
      ast,
      extraDirectivesToKeep: new Set(),
    });

    const printed = print(result);
    expect(printed).toContain("@myDirective");
  });

  test("keeps directives specified in extraDirectivesToKeep", () => {
    const ast = parse(`
      type Query {
        users: [User!]! @expose(tags: ["public"])
      }

      type User {
        id: ID!
      }
    `);

    const result = stripUnknownDirectives({
      ast,
      extraDirectivesToKeep: new Set(["expose"]),
    });

    const printed = print(result);
    expect(printed).toContain('@expose(tags: ["public"])');
  });

  test("removes multiple unknown directives while keeping known ones", () => {
    const ast = parse(`
      directive @known on FIELD_DEFINITION

      type Query {
        users: [User!]! @known @unknown1 @expose(tags: ["public"]) @unknown2
      }

      type User {
        id: ID!
      }
    `);

    const result = stripUnknownDirectives({
      ast,
      extraDirectivesToKeep: new Set(["expose"]),
    });

    const printed = print(result);
    expect(printed).toContain("@known");
    expect(printed).toContain("@expose");
    expect(printed).not.toContain("@unknown1");
    expect(printed).not.toContain("@unknown2");
  });
});
