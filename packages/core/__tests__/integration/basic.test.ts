import { describe, test, expect } from "bun:test";
import { buildSchema } from "graphql";
import { filterSchema } from "../../src";
import {
  checkType,
  checkField,
  getVisibleTypeNames,
  getQueryFieldNames,
  schemaContains,
} from "../helpers";

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
    const filteredSchema = await filterSchema(schema, {
      target: "readonly",
    });

    // Query: only users should be included
    expect(schemaContains(filteredSchema, "users: [User!]!")).toBe(true);
    expect(checkField(filteredSchema, "Query", "adminUsers")).toBe(
      "field-not-found"
    );
    expect(checkField(filteredSchema, "Query", "createUser")).toBe(
      "field-not-found"
    );

    // User: should include default fields, exclude admin-only and explicitly excluded
    expect(checkField(filteredSchema, "User", "id")).toBe("exists");
    expect(checkField(filteredSchema, "User", "name")).toBe("exists");
    expect(checkField(filteredSchema, "User", "email")).toBe("exists");
    expect(checkField(filteredSchema, "User", "salary")).toBe(
      "field-not-found"
    );
    expect(checkField(filteredSchema, "User", "password")).toBe(
      "field-not-found"
    );

    // CreateUserInput should not be reachable
    expect(checkType(filteredSchema, "CreateUserInput")).toBe("not-found");
  });

  test("should filter schema for admin target", async () => {
    const filteredSchema = await filterSchema(schema, {
      target: "admin",
    });

    // Query: all fields should be included
    expect(schemaContains(filteredSchema, "users: [User!]!")).toBe(true);
    expect(schemaContains(filteredSchema, "adminUsers: [User!]!")).toBe(true);
    expect(
      schemaContains(
        filteredSchema,
        "createUser(input: CreateUserInput!): User!"
      )
    ).toBe(true);

    // User: should include default fields and admin-only fields, exclude explicitly excluded
    expect(checkField(filteredSchema, "User", "id")).toBe("exists");
    expect(checkField(filteredSchema, "User", "name")).toBe("exists");
    expect(checkField(filteredSchema, "User", "email")).toBe("exists");
    expect(checkField(filteredSchema, "User", "salary")).toBe("exists");
    // password is excluded from User type (@expose(tags: []))

    // CreateUserInput should be reachable and include appropriate fields
    // Note: password in CreateUserInput has no @expose, so it's included (permissive mode for input types)
    expect(checkType(filteredSchema, "CreateUserInput")).toBe("exists");
    expect(checkField(filteredSchema, "CreateUserInput", "salary")).toBe(
      "exists"
    );
  });

  test("should have correct type counts", async () => {
    const readonlySchema = await filterSchema(schema, {
      target: "readonly",
    });
    const adminSchema = await filterSchema(schema, {
      target: "admin",
    });

    const readonlyTypes = getVisibleTypeNames(readonlySchema);
    const adminTypes = getVisibleTypeNames(adminSchema);

    // readonly: Query, User, ID, String, Boolean (standard scalars)
    // admin: Query, User, CreateUserInput, ID, String, Float, Boolean
    expect(adminTypes.length).toBeGreaterThan(readonlyTypes.length);
    expect(checkType(adminSchema, "CreateUserInput")).toBe("exists");
    expect(checkType(readonlySchema, "CreateUserInput")).toBe("not-found");
  });

  test("should have correct query field counts", async () => {
    const readonlySchema = await filterSchema(schema, {
      target: "readonly",
    });
    const adminSchema = await filterSchema(schema, {
      target: "admin",
    });

    const readonlyQueryFields = getQueryFieldNames(readonlySchema);
    const adminQueryFields = getQueryFieldNames(adminSchema);

    expect(readonlyQueryFields).toEqual(["users"]);
    expect(adminQueryFields).toEqual(["users", "adminUsers", "createUser"]);
  });
});
