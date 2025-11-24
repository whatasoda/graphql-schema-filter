import { describe, test, expect } from "bun:test";
import { buildSchema, printSchema } from "graphql";
import {
  buildFilteredSchema,
  buildFilteredTypeMap,
} from "../../src/filter/schema-filter";
import { parseExposeDirectives } from "../../src/parser/expose-parser";

describe("buildFilteredSchema", () => {
  test("should filter schema based on reachable types and exposed fields", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        user: User @expose(tags: ["user", "admin"])
        admin: Admin @expose(tags: ["admin"])
      }

      type User {
        id: ID!
        name: String!
        email: String @expose(tags: ["admin"])
      }

      type Admin {
        id: ID!
        privileges: [String!]!
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = new Set(["User", "ID", "String"]);

    const filteredSchema = buildFilteredSchema(
      schema,
      "user",
      reachableTypes,
      parsedDirectives
    );

    const filteredSchemaStr = printSchema(filteredSchema);

    // Should include User but not Admin (not reachable)
    expect(filteredSchemaStr).toContain("type User");
    expect(filteredSchemaStr).not.toContain("type Admin");

    // User should have id and name, but not email (not exposed to user role)
    expect(filteredSchemaStr).toContain("id: ID!");
    expect(filteredSchemaStr).toContain("name: String!");
    expect(filteredSchemaStr).not.toContain("email:");
  });

  test("should respect fieldRetention config", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        user: User @expose(tags: ["user"])
      }

      type User {
        id: ID!
        name: String!
        email: String @expose(tags: ["admin"])
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = new Set(["User", "ID", "String"]);

    // With fieldRetention: 'exposed-only' (default)
    const filteredSchemaExposedOnly = buildFilteredSchema(
      schema,
      "user",
      reachableTypes,
      parsedDirectives,
      { fieldRetention: "exposed-only" }
    );

    const exposedOnlyStr = printSchema(filteredSchemaExposedOnly);

    // Should not include email (not exposed to user)
    expect(exposedOnlyStr).not.toContain("email:");

    // With fieldRetention: 'all-for-included-type'
    const filteredSchemaAll = buildFilteredSchema(
      schema,
      "user",
      reachableTypes,
      parsedDirectives,
      { fieldRetention: "all-for-included-type" }
    );

    const allStr = printSchema(filteredSchemaAll);

    // Should include all fields including email
    expect(allStr).toContain("email:");
  });

  test("should filter Query fields based on @expose", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        publicQuery: String @expose(tags: ["user", "admin"])
        adminQuery: String @expose(tags: ["admin"])
        noExposeQuery: String
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = new Set(["String"]);

    const filteredSchema = buildFilteredSchema(
      schema,
      "user",
      reachableTypes,
      parsedDirectives
    );

    const filteredSchemaStr = printSchema(filteredSchema);

    // Should include publicQuery (exposed to user)
    expect(filteredSchemaStr).toContain("publicQuery:");

    // Should not include adminQuery (not exposed to user)
    expect(filteredSchemaStr).not.toContain("adminQuery:");

    // Should not include noExposeQuery (Query fields without @expose are excluded)
    expect(filteredSchemaStr).not.toContain("noExposeQuery:");
  });

  test("should handle InputObject types with permissive mode", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      type Query {
        createUser(input: CreateUserInput!): User @expose(tags: ["user"])
      }

      type User {
        id: ID!
      }

      input CreateUserInput {
        name: String!
        email: String!
        password: String @expose(tags: ["admin"])
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = new Set(["User", "CreateUserInput", "ID", "String"]);

    const filteredSchema = buildFilteredSchema(
      schema,
      "user",
      reachableTypes,
      parsedDirectives
    );

    const filteredSchemaStr = printSchema(filteredSchema);

    // Should include name and email (no @expose means included by default)
    expect(filteredSchemaStr).toContain("name: String!");
    expect(filteredSchemaStr).toContain("email: String!");

    // Should not include password (exposed only to admin)
    expect(filteredSchemaStr).not.toContain("password:");
  });

  test("should handle empty reachable types", () => {
    const schema = buildSchema(`
      type Query {
        hello: String
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = new Set<string>();

    const filteredSchema = buildFilteredSchema(
      schema,
      "user",
      reachableTypes,
      parsedDirectives
    );

    // Schema should have no query type (no reachable types)
    expect(filteredSchema.getQueryType()).toBeUndefined();
  });

  test("should preserve type descriptions and metadata", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        user: User @expose(tags: ["user"])
      }

      """User account information"""
      type User {
        """Unique identifier"""
        id: ID!
        name: String!
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = new Set(["User", "ID", "String"]);

    const filteredSchema = buildFilteredSchema(
      schema,
      "user",
      reachableTypes,
      parsedDirectives
    );

    const userType = filteredSchema.getType("User");

    // Should preserve type description
    expect(userType?.description).toBe("User account information");
  });
});

describe("buildFilteredTypeMap", () => {
  test("should build map of filtered types", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        user: User @expose(tags: ["user"])
      }

      type User {
        id: ID!
        name: String!
        email: String @expose(tags: ["admin"])
      }

      type Admin {
        id: ID!
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = new Set(["User", "ID", "String"]);

    const filteredTypeMap = buildFilteredTypeMap(
      schema,
      "user",
      reachableTypes,
      parsedDirectives,
      { fieldRetention: "exposed-only" }
    );

    // Should include User
    expect(filteredTypeMap.has("User")).toBe(true);

    // Should not include Admin (not reachable)
    expect(filteredTypeMap.has("Admin")).toBe(false);

    // Should not include Query (root types are handled separately)
    expect(filteredTypeMap.has("Query")).toBe(false);

    // Should include scalars
    expect(filteredTypeMap.has("ID")).toBe(true);
    expect(filteredTypeMap.has("String")).toBe(true);
  });

  test("should filter fields from Object types", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        user: User @expose(tags: ["user"])
      }

      type User {
        id: ID!
        name: String!
        email: String @expose(tags: ["admin"])
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = new Set(["User", "ID", "String"]);

    const filteredTypeMap = buildFilteredTypeMap(
      schema,
      "user",
      reachableTypes,
      parsedDirectives,
      { fieldRetention: "exposed-only" }
    );

    const filteredUser = filteredTypeMap.get("User");

    expect(filteredUser).toBeDefined();

    if (filteredUser && "getFields" in filteredUser) {
      const fields = filteredUser.getFields();

      // Should have id and name
      expect(fields.id).toBeDefined();
      expect(fields.name).toBeDefined();

      // Should not have email (not exposed to user role)
      expect(fields.email).toBeUndefined();
    }
  });

  test("should preserve Scalar and Enum types as-is", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        user: User @expose(tags: ["user"])
      }

      type User {
        id: ID!
        status: UserStatus!
      }

      enum UserStatus {
        ACTIVE
        INACTIVE
      }
    `);

    const parsedDirectives = parseExposeDirectives(schema);
    const reachableTypes = new Set(["User", "UserStatus", "ID"]);

    const filteredTypeMap = buildFilteredTypeMap(
      schema,
      "user",
      reachableTypes,
      parsedDirectives,
      { fieldRetention: "exposed-only" }
    );

    const originalEnum = schema.getType("UserStatus");
    const filteredEnum = filteredTypeMap.get("UserStatus");

    // Should be the same object (not filtered)
    expect(filteredEnum).toBe(originalEnum);
  });
});
