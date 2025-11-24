import { describe, test, expect } from "bun:test";
import { buildSchema } from "graphql";
import { computeReachability, traverseReachableTypes } from "./reachability";
import { parseExposeDirectives } from "../parser/expose-parser";

describe("computeReachability", () => {
  test("should compute reachable types from Query fields", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION

      type Query {
        user: User @expose(tags: ["test"])
        post: Post @expose(tags: ["test"])
      }

      type User {
        id: ID!
        name: String!
        posts: [Post!]!
      }

      type Post {
        id: ID!
        title: String!
        author: User!
      }

      type UnreachableType {
        id: ID!
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(
      schema,
      "test",
      parsedDirectives
    );

    // Should include User and Post (via User.posts)
    expect(reachableTypes.has("User")).toBe(true);
    expect(reachableTypes.has("Post")).toBe(true);

    // Should include scalars
    expect(reachableTypes.has("ID")).toBe(true);
    expect(reachableTypes.has("String")).toBe(true);

    // Should not include UnreachableType
    expect(reachableTypes.has("UnreachableType")).toBe(false);
  });

  test("should follow argument types", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION

      type Query {
        createUser(input: CreateUserInput!): User @expose(tags: ["test"])
      }

      type User {
        id: ID!
        name: String!
      }

      input CreateUserInput {
        name: String!
        email: String!
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(
      schema,
      "test",
      parsedDirectives
    );

    // Should include both User and CreateUserInput
    expect(reachableTypes.has("User")).toBe(true);
    expect(reachableTypes.has("CreateUserInput")).toBe(true);
  });

  test("should handle Mutation fields", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION

      type Query {
        hello: String
      }

      type Mutation {
        createPost(input: CreatePostInput!): Post @expose(tags: ["test"])
      }

      type Post {
        id: ID!
        title: String!
      }

      input CreatePostInput {
        title: String!
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(
      schema,
      "test",
      parsedDirectives
    );

    // Should include Post and CreatePostInput
    expect(reachableTypes.has("Post")).toBe(true);
    expect(reachableTypes.has("CreatePostInput")).toBe(true);

    // Query and Mutation are included as root types (entry points)
    expect(reachableTypes.has("Query")).toBe(true);
    expect(reachableTypes.has("Mutation")).toBe(true);
  });

  test("should not include types without exposed root fields", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION

      type Query {
        hello: String @expose(tags: ["admin"])
      }

      type User {
        id: ID!
        posts: [Post!]!
      }

      type Post {
        id: ID!
        author: User!
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(
      schema,
      "test",
      parsedDirectives
    );

    // Should not include User or Post (no exposed fields for "test" role)
    expect(reachableTypes.has("User")).toBe(false);
    expect(reachableTypes.has("Post")).toBe(false);
    expect(reachableTypes.has("String")).toBe(false);
  });

  test("should handle circular references", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION

      type Query {
        user: User @expose(tags: ["test"])
      }

      type User {
        id: ID!
        friends: [User!]!
        posts: [Post!]!
      }

      type Post {
        id: ID!
        author: User!
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(
      schema,
      "test",
      parsedDirectives
    );

    // Should handle circular User -> User reference
    expect(reachableTypes.has("User")).toBe(true);
    expect(reachableTypes.has("Post")).toBe(true);
  });


  test("should handle Union types", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION

      type Query {
        search: SearchResult @expose(tags: ["test"])
      }

      union SearchResult = User | Post

      type User {
        id: ID!
        name: String!
      }

      type Post {
        id: ID!
        title: String!
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(
      schema,
      "test",
      parsedDirectives
    );

    // Should include both User and Post (members of SearchResult)
    expect(reachableTypes.has("SearchResult")).toBe(true);
    expect(reachableTypes.has("User")).toBe(true);
    expect(reachableTypes.has("Post")).toBe(true);
  });

  test("should handle nested InputObject types", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION

      type Query {
        createUser(input: CreateUserInput!): User @expose(tags: ["test"])
      }

      type User {
        id: ID!
      }

      input CreateUserInput {
        profile: ProfileInput!
      }

      input ProfileInput {
        settings: SettingsInput
      }

      input SettingsInput {
        theme: String
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(
      schema,
      "test",
      parsedDirectives
    );

    // Should follow nested InputObject types
    expect(reachableTypes.has("CreateUserInput")).toBe(true);
    expect(reachableTypes.has("ProfileInput")).toBe(true);
    expect(reachableTypes.has("SettingsInput")).toBe(true);
  });

  test("should return only root types when no fields are exposed", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION

      type Query {
        hello: String @expose(tags: ["admin"])
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(
      schema,
      "test",
      parsedDirectives
    );

    // Should only include Query (entry point) but no other types
    expect(reachableTypes.has("Query")).toBe(true);
    expect(reachableTypes.has("String")).toBe(false);
    expect(reachableTypes.size).toBe(1);
  });
});

describe("traverseReachableTypes (generator)", () => {
  test("should yield types lazily (early termination)", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION

      type Query {
        user: User @expose(tags: ["test"])
      }

      type User {
        id: ID!
        name: String!
        posts: [Post!]!
      }

      type Post {
        id: ID!
        title: String!
        content: String!
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const generator = traverseReachableTypes({
      schema,
      role: "test",
      parsedDirectives,
    });

    // Take only the first 3 types
    const firstThree = [];
    for (const typeName of generator) {
      firstThree.push(typeName);
      if (firstThree.length === 3) {
        break; // Early termination
      }
    }

    // Should have stopped early
    expect(firstThree.length).toBe(3);
    expect(firstThree).toContain("Query");
  });

  test("should produce the same result as computeReachability", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION

      type Query {
        user: User @expose(tags: ["test"])
        post: Post @expose(tags: ["test"])
      }

      type User {
        id: ID!
        name: String!
        posts: [Post!]!
      }

      type Post {
        id: ID!
        title: String!
        author: User!
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);

    // Using computeReachability
    const reachableSet = computeReachability(schema, "test", parsedDirectives);

    // Using generator directly
    const generatorResult = new Set<string>();
    for (const typeName of traverseReachableTypes({
      schema,
      role: "test",
      parsedDirectives,
    })) {
      generatorResult.add(typeName);
    }

    // Should produce identical results
    expect(generatorResult).toEqual(reachableSet);
  });

  test("should support iterator protocol (spread operator)", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION

      type Query {
        hello: String @expose(tags: ["test"])
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);

    // Using spread operator with generator
    const typeNames = [
      ...traverseReachableTypes({
        schema,
        role: "test",
        parsedDirectives,
      }),
    ];

    // Should work with iterator protocol
    expect(typeNames.length).toBeGreaterThan(0);
    expect(typeNames.includes("Query")).toBe(true);
    expect(typeNames.includes("String")).toBe(true);
  });

  test("should return only root types when no fields are exposed", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION

      type Query {
        hello: String @expose(tags: ["admin"])
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);

    const typeNames = [
      ...traverseReachableTypes({
        schema,
        role: "test",
        parsedDirectives,
      }),
    ];

    // Should only yield Query (no exposed fields for "test" role)
    expect(typeNames).toEqual(["Query"]);
  });
});
