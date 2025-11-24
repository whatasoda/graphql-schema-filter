import { describe, test, expect } from "bun:test";
import { buildSchema } from "graphql";
import { computeReachability, getRootType, traverseReachableTypes } from "./reachability";
import type { EntryPoints } from "../types";
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

    const entryPoints: EntryPoints = {
      queries: ["user"],
      mutations: [],
      types: [],
    };

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(schema, entryPoints, "test", parsedDirectives);

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

    const entryPoints: EntryPoints = {
      queries: ["createUser"],
      mutations: [],
      types: [],
    };

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(schema, entryPoints, "test", parsedDirectives);

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

    const entryPoints: EntryPoints = {
      queries: [],
      mutations: ["createPost"],
      types: [],
    };

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(schema, entryPoints, "test", parsedDirectives);

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

    const entryPoints: EntryPoints = {
      queries: [],
      mutations: [],
      types: ["User"],
    };

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(schema, entryPoints, "test", parsedDirectives);

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

    const entryPoints: EntryPoints = {
      queries: ["user"],
      mutations: [],
      types: [],
    };

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(schema, entryPoints, "test", parsedDirectives);

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

    const entryPoints: EntryPoints = {
      queries: ["node"],
      mutations: [],
      types: [],
    };

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(schema, entryPoints, "test", parsedDirectives, {
      includeInterfaceImplementations: true,
    });

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

    const entryPoints: EntryPoints = {
      queries: ["node"],
      mutations: [],
      types: [],
    };

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(schema, entryPoints, "test", parsedDirectives, {
      includeInterfaceImplementations: false,
    });

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

    const entryPoints: EntryPoints = {
      queries: ["search"],
      mutations: [],
      types: [],
    };

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(schema, entryPoints, "test", parsedDirectives);

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

    const entryPoints: EntryPoints = {
      queries: ["createUser"],
      mutations: [],
      types: [],
    };

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(schema, entryPoints, "test", parsedDirectives);

    // Should follow nested InputObject types
    expect(reachableTypes.has("CreateUserInput")).toBe(true);
    expect(reachableTypes.has("ProfileInput")).toBe(true);
    expect(reachableTypes.has("SettingsInput")).toBe(true);
  });

  test("should respect includeReferenced config option", () => {
    const schema = buildSchema(`
      type Query {
        user: User
      }

      type User {
        id: ID!
        posts: [Post!]!
      }

      type Post {
        id: ID!
        title: String!
      }
    `);

    const entryPoints: EntryPoints = {
      queries: ["user"],
      mutations: [],
      types: [],
    };

    const parsedDirectives = parseExposeDirectives(schema);

    // With includeReferenced: 'none'
    const reachableTypesNone = computeReachability(schema, entryPoints, "test", parsedDirectives, {
      includeReferenced: "none",
    });

    // Should only include User (entry point return type) and scalars
    expect(reachableTypesNone.has("User")).toBe(true);
    expect(reachableTypesNone.has("Post")).toBe(false);

    // With includeReferenced: 'all' (default)
    const reachableTypesAll = computeReachability(schema, entryPoints, "test", parsedDirectives, {
      includeReferenced: "all",
    });

    // Should include both User and Post
    expect(reachableTypesAll.has("User")).toBe(true);
    expect(reachableTypesAll.has("Post")).toBe(true);
  });

  test("should handle empty entry points", () => {
    const schema = buildSchema(`
      type Query {
        hello: String
      }
    `);

    const entryPoints: EntryPoints = {
      queries: [],
      mutations: [],
      types: [],
    };

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = computeReachability(schema, entryPoints, "test", parsedDirectives);

    // Should return empty set (no reachable types)
    expect(reachableTypes.size).toBe(0);
  });

  test("should warn for non-existent query fields", () => {
    const schema = buildSchema(`
      type Query {
        hello: String
      }
    `);

    const entryPoints: EntryPoints = {
      queries: ["nonExistent"],
      mutations: [],
      types: [],
    };

    const parsedDirectives = parseExposeDirectives(schema);
    // Should not throw, just warn
    const reachableTypes = computeReachability(schema, entryPoints, "test", parsedDirectives);

    expect(reachableTypes.size).toBe(0);
  });
});

describe("getRootType", () => {
  test("should return Query type", () => {
    const schema = buildSchema(`
      type Query {
        hello: String
      }
    `);

    const queryType = getRootType(schema, "Query");

    expect(queryType).toBeDefined();
    expect(queryType?.name).toBe("Query");
  });

  test("should return Mutation type", () => {
    const schema = buildSchema(`
      type Query {
        hello: String
      }

      type Mutation {
        createUser: User
      }

      type User {
        id: ID!
      }
    `);

    const mutationType = getRootType(schema, "Mutation");

    expect(mutationType).toBeDefined();
    expect(mutationType?.name).toBe("Mutation");
  });

  test("should return undefined if root type does not exist", () => {
    const schema = buildSchema(`
      type Query {
        hello: String
      }
    `);

    const mutationType = getRootType(schema, "Mutation");

    expect(mutationType).toBeUndefined();
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

    const entryPoints: EntryPoints = {
      queries: ["user"],
      mutations: [],
      types: [],
    };

    const parsedDirectives = parseExposeDirectives(schema);
    const generator = traverseReachableTypes(
      schema,
      entryPoints,
      "test",
      parsedDirectives,
      { includeInterfaceImplementations: true, includeReferenced: "all" }
    );

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

    const entryPoints: EntryPoints = {
      queries: ["user"],
      mutations: [],
      types: [],
    };

    const parsedDirectives = parseExposeDirectives(schema);

    // Using computeReachability
    const reachableSet = computeReachability(schema, entryPoints, "test", parsedDirectives);

    // Using generator directly
    const generatorResult = new Set<string>();
    for (const typeName of traverseReachableTypes(
      schema,
      entryPoints,
      "test",
      parsedDirectives,
      { includeInterfaceImplementations: true, includeReferenced: "all" }
    )) {
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

    const entryPoints: EntryPoints = {
      queries: ["hello"],
      mutations: [],
      types: [],
    };

    const parsedDirectives = parseExposeDirectives(schema);

    // Using spread operator with generator
    const typeNames = [
      ...traverseReachableTypes(
        schema,
        entryPoints,
        "test",
        parsedDirectives,
        { includeInterfaceImplementations: true, includeReferenced: "all" }
      ),
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

    const entryPoints: EntryPoints = {
      queries: [],
      mutations: [],
      types: [],
    };

    const parsedDirectives = parseExposeDirectives(schema);

    const typeNames = [
      ...traverseReachableTypes(
        schema,
        entryPoints,
        "test",
        parsedDirectives,
        { includeInterfaceImplementations: true, includeReferenced: "all" }
      ),
    ];

    // Should yield no types
    expect(typeNames.length).toBe(0);
  });
});
