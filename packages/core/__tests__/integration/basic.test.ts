import { describe, test, expect } from "bun:test";
import { buildSchema, printSchema } from "graphql";
import { filterSchemaForTarget } from "../../src";

describe("basic usage", () => {
  const schema = buildSchema(`
    directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
    directive @disableAutoExpose on OBJECT | INTERFACE

    type Query {
      users: [User!]! @expose(tags: ["readonly", "admin"])
      adminUsers: [User!]! @expose(tags: ["admin"])
      createUser(input: CreateUserInput!): User! @expose(tags: ["admin"])
    }

    type User {
      # Default public (included without @expose)
      id: ID!
      name: String!
      email: String!
      # admin only
      salary: Float @expose(tags: ["admin"])
      # Explicitly excluded with empty tags
      password: String @expose(tags: [])
    }

    input CreateUserInput {
      name: String!
      email: String!
      # admin only (restricted when @expose is present)
      salary: Float @expose(tags: ["admin"])
      # Fields without @expose are included by default (permissive mode)
      password: String
    }
  `);

  test("should filter schema for readonly target", async () => {
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "readonly",
    });
    const filteredSchemaStr = printSchema(filteredSchema);

    // Query: only users should be included
    expect(filteredSchemaStr).toContain("users: [User!]!");
    expect(filteredSchemaStr).not.toContain("adminUsers:");
    expect(filteredSchemaStr).not.toContain("createUser:");

    // User: should include default fields, exclude admin-only and explicitly excluded
    expect(filteredSchemaStr).toContain("id: ID!");
    expect(filteredSchemaStr).toContain("name: String!");
    expect(filteredSchemaStr).toContain("email: String!");
    expect(filteredSchemaStr).not.toContain("salary:");
    expect(filteredSchemaStr).not.toContain("password:");

    // CreateUserInput should not be reachable
    expect(filteredSchemaStr).not.toContain("CreateUserInput");
  });

  test("should filter schema for admin target", async () => {
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "admin",
    });
    const filteredSchemaStr = printSchema(filteredSchema);

    // Query: all fields should be included
    expect(filteredSchemaStr).toContain("users: [User!]!");
    expect(filteredSchemaStr).toContain("adminUsers: [User!]!");
    expect(filteredSchemaStr).toContain(
      "createUser(input: CreateUserInput!): User!"
    );

    // User: should include default fields and admin-only fields, exclude explicitly excluded
    expect(filteredSchemaStr).toContain("id: ID!");
    expect(filteredSchemaStr).toContain("name: String!");
    expect(filteredSchemaStr).toContain("email: String!");
    expect(filteredSchemaStr).toContain("salary: Float");
    // password is excluded from User type (@expose(tags: []))
    // But we need to check in context - User type should not have password

    // CreateUserInput should be reachable and include appropriate fields
    // Note: password in CreateUserInput has no @expose, so it's included (permissive mode for input types)
    expect(filteredSchemaStr).toContain("input CreateUserInput");
    expect(filteredSchemaStr).toContain("salary: Float");
  });

  test("should have correct type counts", async () => {
    const readonlySchema = await filterSchemaForTarget(schema, {
      target: "readonly",
    });
    const adminSchema = await filterSchemaForTarget(schema, {
      target: "admin",
    });

    const readonlyTypes = Object.keys(readonlySchema.getTypeMap()).filter(
      (name) => !name.startsWith("__")
    );
    const adminTypes = Object.keys(adminSchema.getTypeMap()).filter(
      (name) => !name.startsWith("__")
    );

    // readonly: Query, User, ID, String, Boolean (standard scalars)
    // admin: Query, User, CreateUserInput, ID, String, Float, Boolean
    expect(adminTypes.length).toBeGreaterThan(readonlyTypes.length);
    expect(adminTypes).toContain("CreateUserInput");
    expect(readonlyTypes).not.toContain("CreateUserInput");
  });

  test("should have correct query field counts", async () => {
    const readonlySchema = await filterSchemaForTarget(schema, {
      target: "readonly",
    });
    const adminSchema = await filterSchemaForTarget(schema, {
      target: "admin",
    });

    const readonlyQueryFields = Object.keys(
      readonlySchema.getQueryType()?.getFields() ?? {}
    );
    const adminQueryFields = Object.keys(
      adminSchema.getQueryType()?.getFields() ?? {}
    );

    expect(readonlyQueryFields).toEqual(["users"]);
    expect(adminQueryFields).toEqual(["users", "adminUsers", "createUser"]);
  });
});
