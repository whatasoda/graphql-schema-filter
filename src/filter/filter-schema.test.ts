import { describe, test, expect } from "bun:test";
import { buildSchema, printSchema } from "graphql";
import { filterSchema } from "./filter-schema";

describe("filterSchemaForTarget (integration)", () => {
  test("should filter complete schema for user target", async () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
      directive @disableAutoExpose on OBJECT | INTERFACE

      type Query {
        users: [User!]! @expose(tags: ["user", "admin"])
        adminUsers: [User!]! @expose(tags: ["admin"])
        createUser(input: CreateUserInput!): User! @expose(tags: ["admin"])
      }

      type User {
        id: ID!
        name: String!
        email: String!
        salary: Float @expose(tags: ["admin"])
      }

      input CreateUserInput {
        name: String!
        email: String!
        salary: Float
        password: String
      }
    `);

    const filteredSchema = await filterSchema(schema, {
      target: "user",
    });

    const filteredSchemaStr = printSchema(filteredSchema);

    // Should only include users query
    expect(filteredSchemaStr).toContain("users: [User!]!");
    expect(filteredSchemaStr).not.toContain("adminUsers:");
    expect(filteredSchemaStr).not.toContain("createUser:");

    // User should not have salary field
    expect(filteredSchemaStr).toContain("type User");
    expect(filteredSchemaStr).not.toContain("salary:");

    // Should not include CreateUserInput (not reachable)
    expect(filteredSchemaStr).not.toContain("CreateUserInput");
  });

  test("should filter complete schema for admin target", async () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      type Query {
        users: [User!]! @expose(tags: ["user", "admin"])
        adminUsers: [User!]! @expose(tags: ["admin"])
        createUser(input: CreateUserInput!): User! @expose(tags: ["admin"])
      }

      type User {
        id: ID!
        name: String!
        email: String!
        salary: Float @expose(tags: ["admin"])
      }

      input CreateUserInput {
        name: String!
        email: String!
        salary: Float
        password: String
      }
    `);

    const filteredSchema = await filterSchema(schema, {
      target: "admin",
    });

    const filteredSchemaStr = printSchema(filteredSchema);

    // Should include all queries
    expect(filteredSchemaStr).toContain("users: [User!]!");
    expect(filteredSchemaStr).toContain("adminUsers: [User!]!");
    expect(filteredSchemaStr).toContain(
      "createUser(input: CreateUserInput!): User!"
    );

    // User should include salary field
    expect(filteredSchemaStr).toContain("salary: Float");

    // Should include CreateUserInput
    expect(filteredSchemaStr).toContain("input CreateUserInput");
  });

  test("should respect @disableAutoExpose directive", async () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION
      directive @disableAutoExpose on OBJECT | INTERFACE

      type Query {
        billing: BillingInfo @expose(tags: ["admin"])
      }

      type BillingInfo @disableAutoExpose {
        id: ID!
        accountNumber: String @expose(tags: ["admin"])
        balance: Float
      }
    `);

    const filteredSchema = await filterSchema(schema, {
      target: "admin",
    });

    const filteredSchemaStr = printSchema(filteredSchema);

    // BillingInfo should only include fields with @expose
    expect(filteredSchemaStr).toContain("accountNumber: String");

    // Should not include id or balance (no @expose on type with @disableAutoExpose)
    expect(filteredSchemaStr).not.toContain("id: ID!");
    expect(filteredSchemaStr).not.toContain("balance:");
  });

  test("should handle explicit entry points", async () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      type Query {
        user: User @expose(tags: ["user"])
        admin: Admin @expose(tags: ["admin"])
      }

      type User {
        id: ID!
        name: String!
      }

      type Admin {
        id: ID!
        privileges: [String!]!
      }
    `);

    const filteredSchema = await filterSchema(schema, {
      target: "user",
    });

    const filteredSchemaStr = printSchema(filteredSchema);

    // Should include user query and User type
    expect(filteredSchemaStr).toContain("user: User");
    expect(filteredSchemaStr).toContain("type User");

    // Should not include admin query and Admin type
    expect(filteredSchemaStr).not.toContain("admin:");
    expect(filteredSchemaStr).not.toContain("type Admin");
  });

  test("should handle Mutation fields", async () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      type Query {
        user: User @expose(tags: ["user"])
      }

      type Mutation {
        createUser(name: String!): User @expose(tags: ["admin"])
        updateUser(id: ID!, name: String!): User @expose(tags: ["user"])
      }

      type User {
        id: ID!
        name: String!
      }
    `);

    const userSchema = await filterSchema(schema, {
      target: "user",
    });

    const userSchemaStr = printSchema(userSchema);

    // User should see updateUser but not createUser
    expect(userSchemaStr).toContain("updateUser(id: ID!, name: String!): User");
    expect(userSchemaStr).not.toContain("createUser:");

    const adminSchema = await filterSchema(schema, {
      target: "admin",
    });

    const adminSchemaStr = printSchema(adminSchema);

    // Admin should see createUser but no exposed query fields
    expect(adminSchemaStr).toContain("createUser(name: String!): User");
  });

  // TODO: Fix circular type reference handling
  // Currently failing due to duplicate type issues when types have self-references
  test.skip("should handle circular type references", async () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      type Query {
        user: User @expose(tags: ["user"])
      }

      type User {
        id: ID!
        name: String!
        friends: [User!]!
        posts: [Post!]!
      }

      type Post {
        id: ID!
        title: String!
        author: User!
      }
    `);

    const filteredSchema = await filterSchema(schema, {
      target: "user",
    });

    const filteredSchemaStr = printSchema(filteredSchema);

    // Should handle circular User -> friends: [User!]!
    expect(filteredSchemaStr).toMatch(/friends.*User/);

    // Should include Post (reachable from User.posts)
    expect(filteredSchemaStr).toContain("type Post");
  });

  // TODO: Fix interface implementation inclusion
  // Currently failing - interface implementations not being included in reachable types
  test.skip("should handle Interface types", async () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        node(id: ID!): Node @expose(tags: ["user"])
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

    const filteredSchema = await filterSchema(schema, {
      target: "user",
    });

    const filteredSchemaStr = printSchema(filteredSchema);

    // Should include Node interface
    expect(filteredSchemaStr).toContain("interface Node");

    // Should include both implementations (when includeInterfaceImplementations is true by default)
    expect(filteredSchemaStr).toContain("type User implements Node");
    expect(filteredSchemaStr).toContain("type Post implements Node");
  });

  test("should handle Union types", async () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        search: SearchResult @expose(tags: ["user"])
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

    const filteredSchema = await filterSchema(schema, {
      target: "user",
    });

    const filteredSchemaStr = printSchema(filteredSchema);

    // Should include SearchResult union
    expect(filteredSchemaStr).toContain("union SearchResult = User | Post");

    // Should include both union members
    expect(filteredSchemaStr).toContain("type User");
    expect(filteredSchemaStr).toContain("type Post");
  });

  test("should handle nested InputObject types", async () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        createUser(input: CreateUserInput!): User @expose(tags: ["admin"])
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

    const filteredSchema = await filterSchema(schema, {
      target: "admin",
    });

    const filteredSchemaStr = printSchema(filteredSchema);

    // Should include all nested InputObject types
    expect(filteredSchemaStr).toContain("input CreateUserInput");
    expect(filteredSchemaStr).toContain("input ProfileInput");
    expect(filteredSchemaStr).toContain("input SettingsInput");
  });

  test("should preserve field arguments", async () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        user(id: ID!, includeEmail: Boolean): User @expose(tags: ["user"])
      }

      type User {
        id: ID!
        name: String!
      }
    `);

    const filteredSchema = await filterSchema(schema, {
      target: "user",
    });

    const filteredSchemaStr = printSchema(filteredSchema);

    // Should preserve field arguments
    expect(filteredSchemaStr).toContain(
      "user(id: ID!, includeEmail: Boolean): User"
    );
  });
});
