import { describe, test, expect } from "bun:test";
import { buildSchema } from "graphql";
import { computeReachability, traverseReachableTypes } from "./reachability";
import { parseExposeDirectives } from "../parser/expose-parser";

describe("computeReachability", () => {
  test("should compute reachable types from Query fields", () => {
    const schema = buildSchema(`
      type Query {
        user: User
        post: Post
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
      type Query {
        createUser(input: CreateUserInput!): User
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
      type Query {
        hello: String
      }

      type Mutation {
        createPost(input: CreatePostInput!): Post
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

    // Should not include Query
    expect(reachableTypes.has("Query")).toBe(false);
  });

  test("should handle explicitly added types", () => {
    const schema = buildSchema(`
      type Query {
        hello: String
      }

      type User {
        id: ID!
        name: String!
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

    // Should include User
    expect(reachableTypes.has("User")).toBe(true);

    // Should not include Post (not reachable from User)
    expect(reachableTypes.has("Post")).toBe(false);
  });

  test("should handle circular references", () => {
    const schema = buildSchema(`
      type Query {
        user: User
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

  test("should follow interface implementations when includeInterfaceImplementations is true", () => {
    const schema = buildSchema(`
      type Query {
        node(id: ID!): Node
      }

      interface Node {
        id: ID!
      }

      type User implements Node {
        id: ID!
        name: String!
      }

      type Post implements Node {
        id: ID!
        title: String!
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(
      schema,
      "test",
      parsedDirectives,
      {
        includeInterfaceImplementations: true,
      }
    );

    // Should include both User and Post (implementations of Node)
    expect(reachableTypes.has("Node")).toBe(true);
    expect(reachableTypes.has("User")).toBe(true);
    expect(reachableTypes.has("Post")).toBe(true);
  });

  test("should not follow interface implementations when includeInterfaceImplementations is false", () => {
    const schema = buildSchema(`
      type Query {
        node(id: ID!): Node
      }

      interface Node {
        id: ID!
      }

      type User implements Node {
        id: ID!
        name: String!
      }

      type Post implements Node {
        id: ID!
        title: String!
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(
      schema,
      "test",
      parsedDirectives,
      {
        includeInterfaceImplementations: false,
      }
    );

    // Should include Node but not its implementations
    expect(reachableTypes.has("Node")).toBe(true);
    expect(reachableTypes.has("User")).toBe(false);
    expect(reachableTypes.has("Post")).toBe(false);
  });

  test("should handle Union types", () => {
    const schema = buildSchema(`
      type Query {
        search: SearchResult
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
      type Query {
        createUser(input: CreateUserInput!): User
      }

      type User {
        id: ID!
      }

      input CreateUserInput {
        profile: ProfileInput!
      }

      input ProfileInput {
        name: String!
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

  test("should handle empty entry points", () => {
    const schema = buildSchema(`
      type Query {
        hello: String
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(
      schema,
      "test",
      parsedDirectives
    );

    // Should return empty set (no reachable types)
    expect(reachableTypes.size).toBe(0);
  });

  test("should warn for non-existent query fields", () => {
    const schema = buildSchema(`
      type Query {
        hello: String
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    // Should not throw, just warn
    const reachableTypes = computeReachability(
      schema,
      "test",
      parsedDirectives
    );

    expect(reachableTypes.size).toBe(0);
  });
});

describe("traverseReachableTypes (generator)", () => {
  test("should yield types lazily (early termination)", () => {
    const schema = buildSchema(`
      type Query {
        user: User
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
      config: {
        includeInterfaceImplementations: true,
      },
    });

    // Take only the first 2 types
    const firstTwo = [];
    for (const typeName of generator) {
      firstTwo.push(typeName);
      if (firstTwo.length === 2) {
        break; // Early termination
      }
    }

    // Should have stopped early
    expect(firstTwo.length).toBe(2);
    expect(firstTwo.includes("User")).toBe(true);
  });

  test("should produce the same result as computeReachability", () => {
    const schema = buildSchema(`
      type Query {
        user: User
        post: Post
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
      config: { includeInterfaceImplementations: true },
    })) {
      generatorResult.add(typeName);
    }

    // Should produce identical results
    expect(generatorResult).toEqual(reachableSet);
  });

  test("should support iterator protocol (spread operator)", () => {
    const schema = buildSchema(`
      type Query {
        hello: String
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);

    // Using spread operator with generator
    const typeNames = [
      ...traverseReachableTypes({
        schema,
        role: "test",
        parsedDirectives,
        config: {
          includeInterfaceImplementations: true,
        },
      }),
    ];

    // Should work with iterator protocol
    expect(typeNames.length).toBeGreaterThan(0);
    expect(typeNames.includes("String")).toBe(true);
  });

  test("should handle empty entry points (empty iteration)", () => {
    const schema = buildSchema(`
      type Query {
        hello: String
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);

    const typeNames = [
      ...traverseReachableTypes({
        schema,
        role: "test",
        parsedDirectives,
        config: {
          includeInterfaceImplementations: true,
        },
      }),
    ];

    // Should yield no types
    expect(typeNames.length).toBe(0);
  });
});
