import { describe, test, expect } from "bun:test";
import { buildSchema } from "graphql";
import { filterSchema } from "../../src";
import {
  checkType,
  checkField,
  checkInterface,
  schemaContains,
} from "../helpers";

describe("polymorphic types (Interface and Union)", () => {
  const schema = buildSchema(`
    directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
    directive @disableAutoExpose on OBJECT | INTERFACE

    type Query {
      search(query: String!): [SearchResult!]! @expose(tags: ["public"])
      node(id: ID!): Node @expose(tags: ["public"])
      adminContent: [Content!]! @expose(tags: ["admin"])
    }

    interface Node {
      id: ID!
      createdAt: String!
    }

    interface Content {
      id: ID!
      title: String!
      # admin only
      internal: String @expose(tags: ["admin"])
    }

    type Article implements Node & Content {
      id: ID!
      createdAt: String!
      title: String!
      content: String!
      # author only
      draft: String @expose(tags: ["author", "admin"])
      internal: String
    }

    type Comment implements Node {
      id: ID!
      createdAt: String!
      text: String!
      # moderator only
      reportCount: Int @expose(tags: ["moderator", "admin"])
    }

    type Video implements Content {
      id: ID!
      title: String!
      url: String!
      # admin only
      rawFile: String @expose(tags: ["admin"])
      internal: String
    }

    union SearchResult = Article | Comment | Video
  `);

  test("should filter schema for public target", async () => {
    const filteredSchema = filterSchema(schema, {
      target: "public",
    });

    // Query: search and node should be included, adminContent should not
    expect(
      schemaContains(filteredSchema, "search(query: String!): [SearchResult!]!")
    ).toBe(true);
    expect(schemaContains(filteredSchema, "node(id: ID!): Node")).toBe(true);
    expect(checkField(filteredSchema, "Query", "adminContent")).toBe(
      "field-not-found"
    );

    // SearchResult union should be included with all members
    expect(checkType(filteredSchema, "SearchResult")).toBe("exists");
    expect(checkType(filteredSchema, "Article")).toBe("exists");
    expect(checkType(filteredSchema, "Comment")).toBe("exists");
    expect(checkType(filteredSchema, "Video")).toBe("exists");

    // Node interface should be included
    expect(checkType(filteredSchema, "Node")).toBe("exists");

    // Article: draft should not be included for public
    expect(checkField(filteredSchema, "Article", "draft")).toBe(
      "field-not-found"
    );

    // Comment: reportCount should not be included for public
    expect(checkField(filteredSchema, "Comment", "reportCount")).toBe(
      "field-not-found"
    );

    // Video: rawFile should not be included for public
    expect(checkField(filteredSchema, "Video", "rawFile")).toBe(
      "field-not-found"
    );
  });

  test("should filter schema for admin target", async () => {
    const filteredSchema = filterSchema(schema, {
      target: "admin",
    });

    // adminContent should be included
    expect(schemaContains(filteredSchema, "adminContent: [Content!]!")).toBe(
      true
    );

    // Content interface should be included with internal field
    expect(checkType(filteredSchema, "Content")).toBe("exists");
    expect(checkField(filteredSchema, "Content", "internal")).toBe("exists");

    // Article: draft should be included for admin
    expect(checkField(filteredSchema, "Article", "draft")).toBe("exists");

    // Comment: reportCount should be included for admin
    expect(checkField(filteredSchema, "Comment", "reportCount")).toBe("exists");

    // Video: rawFile should be included for admin
    expect(checkField(filteredSchema, "Video", "rawFile")).toBe("exists");
  });

  test("should include all union members when union is reachable", async () => {
    const filteredSchema = filterSchema(schema, {
      target: "public",
    });

    // All union members should be included
    expect(checkType(filteredSchema, "SearchResult")).toBe("exists");
    expect(checkType(filteredSchema, "Article")).toBe("exists");
    expect(checkType(filteredSchema, "Comment")).toBe("exists");
    expect(checkType(filteredSchema, "Video")).toBe("exists");
  });

  test("should include interfaces when implementations are reachable", async () => {
    const filteredSchema = filterSchema(schema, {
      target: "public",
    });

    // Node interface should be included (Article and Comment implement it)
    expect(checkType(filteredSchema, "Node")).toBe("exists");

    // Content interface should be included (Article and Video implement it)
    expect(checkType(filteredSchema, "Content")).toBe("exists");
  });

  test("should preserve interface implementations on types", async () => {
    const filteredSchema = filterSchema(schema, {
      target: "public",
    });

    // Article should still implement both interfaces
    expect(
      schemaContains(filteredSchema, "type Article implements Node & Content")
    ).toBe(true);

    // Verify via helper
    expect(checkInterface(filteredSchema, "Article", "Node")).toBe(
      "implements"
    );
    expect(checkInterface(filteredSchema, "Article", "Content")).toBe(
      "implements"
    );
  });

  test("should have correct type counts for each target", async () => {
    const publicSchema = filterSchema(schema, {
      target: "public",
    });
    const adminSchema = filterSchema(schema, {
      target: "admin",
    });

    // public: has SearchResult, Node, Content (via search and node queries)
    expect(checkType(publicSchema, "Node")).toBe("exists");
    expect(checkType(publicSchema, "Content")).toBe("exists");
    expect(checkType(publicSchema, "SearchResult")).toBe("exists");

    // admin: has Node, Content (via adminContent query), but NOT SearchResult
    // because search query is only exposed to "public"
    expect(checkType(adminSchema, "Node")).toBe("exists");
    expect(checkType(adminSchema, "Content")).toBe("exists");
    // SearchResult is NOT included for admin (search is only exposed to public)
    expect(checkType(adminSchema, "SearchResult")).toBe("not-found");
  });
});
