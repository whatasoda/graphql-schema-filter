import { describe, test, expect } from "bun:test";
import {
  buildSchema,
  printSchema,
  type GraphQLObjectType,
} from "graphql";
import { filterSchemaForTarget } from "../../src";

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
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "public",
    });
    const filteredSchemaStr = printSchema(filteredSchema);

    // Query: search and node should be included, adminContent should not
    expect(filteredSchemaStr).toContain("search(query: String!): [SearchResult!]!");
    expect(filteredSchemaStr).toContain("node(id: ID!): Node");
    expect(filteredSchemaStr).not.toContain("adminContent:");

    // SearchResult union should be included with all members
    expect(filteredSchemaStr).toContain("union SearchResult");
    expect(filteredSchemaStr).toContain("Article");
    expect(filteredSchemaStr).toContain("Comment");
    expect(filteredSchemaStr).toContain("Video");

    // Node interface should be included
    expect(filteredSchemaStr).toContain("interface Node");

    // Article: draft should not be included for public
    expect(filteredSchemaStr).not.toContain("draft:");

    // Comment: reportCount should not be included for public
    expect(filteredSchemaStr).not.toContain("reportCount:");

    // Video: rawFile should not be included for public
    expect(filteredSchemaStr).not.toContain("rawFile:");
  });

  test("should filter schema for admin target", async () => {
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "admin",
    });
    const filteredSchemaStr = printSchema(filteredSchema);

    // adminContent should be included
    expect(filteredSchemaStr).toContain("adminContent: [Content!]!");

    // Content interface should be included with internal field
    expect(filteredSchemaStr).toContain("interface Content");
    expect(filteredSchemaStr).toContain("internal: String");

    // Article: draft should be included for admin
    expect(filteredSchemaStr).toContain("draft: String");

    // Comment: reportCount should be included for admin
    expect(filteredSchemaStr).toContain("reportCount: Int");

    // Video: rawFile should be included for admin
    expect(filteredSchemaStr).toContain("rawFile: String");
  });

  test("should include all union members when union is reachable", async () => {
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "public",
    });

    const types = Object.keys(filteredSchema.getTypeMap()).filter(
      (name) => !name.startsWith("__")
    );

    // All union members should be included
    expect(types).toContain("SearchResult");
    expect(types).toContain("Article");
    expect(types).toContain("Comment");
    expect(types).toContain("Video");
  });

  test("should include interfaces when implementations are reachable", async () => {
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "public",
    });

    const types = Object.keys(filteredSchema.getTypeMap()).filter(
      (name) => !name.startsWith("__")
    );

    // Node interface should be included (Article and Comment implement it)
    expect(types).toContain("Node");

    // Content interface should be included (Article and Video implement it)
    expect(types).toContain("Content");
  });

  test("should preserve interface implementations on types", async () => {
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "public",
    });
    const filteredSchemaStr = printSchema(filteredSchema);

    // Article should still implement both interfaces
    expect(filteredSchemaStr).toContain("type Article implements Node & Content");

    // Verify via schema API
    const articleType = filteredSchema.getType("Article") as
      | GraphQLObjectType
      | undefined;
    if (articleType && "getInterfaces" in articleType) {
      const interfaces = articleType.getInterfaces();
      const interfaceNames = interfaces.map((i) => i.name);
      expect(interfaceNames).toContain("Node");
      expect(interfaceNames).toContain("Content");
    }
  });

  test("should have correct type counts for each target", async () => {
    const publicSchema = await filterSchemaForTarget(schema, {
      target: "public",
    });
    const adminSchema = await filterSchemaForTarget(schema, {
      target: "admin",
    });

    const publicTypes = Object.keys(publicSchema.getTypeMap()).filter(
      (name) => !name.startsWith("__")
    );
    const adminTypes = Object.keys(adminSchema.getTypeMap()).filter(
      (name) => !name.startsWith("__")
    );

    // public: has SearchResult, Node, Content (via search and node queries)
    expect(publicTypes).toContain("Node");
    expect(publicTypes).toContain("Content");
    expect(publicTypes).toContain("SearchResult");

    // admin: has Node, Content (via adminContent query), but NOT SearchResult
    // because search query is only exposed to "public"
    expect(adminTypes).toContain("Node");
    expect(adminTypes).toContain("Content");
    // SearchResult is NOT included for admin (search is only exposed to public)
    expect(adminTypes).not.toContain("SearchResult");
  });
});
