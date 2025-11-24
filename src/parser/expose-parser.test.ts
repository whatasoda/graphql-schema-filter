import { describe, test, expect } from "bun:test";
import { buildSchema } from "graphql";
import {
  parseExposeDirectives,
  isFieldExposed,
  getExposedFields,
} from "./expose-parser";

describe("parseExposeDirectives", () => {
  test("should parse @expose directives from schema", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION
      directive @disableAutoExpose on OBJECT | INTERFACE

      type Query {
        publicField: String
        adminField: String @expose(tags: ["admin"])
        userField: String @expose(tags: ["user", "admin"])
      }

      type User {
        id: ID!
        name: String!
        email: String @expose(tags: ["user", "admin"])
        password: String @expose(tags: [])
      }
    `);

    const analysis = parseExposeDirectives(schema);

    // Query.adminField should have "admin" tag
    expect(
      analysis.exposureInfoMap.get("Query")?.fields.get("adminField")?.tags
    ).toEqual(["admin"]);

    // Query.userField should have both "user" and "admin" tags
    expect(
      analysis.exposureInfoMap.get("Query")?.fields.get("userField")?.tags
    ).toEqual(["user", "admin"]);

    // User.email should have "user" and "admin" tags
    expect(
      analysis.exposureInfoMap.get("User")?.fields.get("email")?.tags
    ).toEqual(["user", "admin"]);

    // User.password should have empty tags (explicitly excluded)
    expect(
      analysis.exposureInfoMap.get("User")?.fields.get("password")?.tags
    ).toEqual([]);
  });

  test("should parse @disableAutoExpose directive", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION
      directive @disableAutoExpose on OBJECT | INTERFACE

      type Query {
        test: String
      }

      type SecureType @disableAutoExpose {
        id: ID!
        secret: String @expose(tags: ["admin"])
      }
    `);

    const analysis = parseExposeDirectives(schema);

    // SecureType should have isAutoExposeDisabled = true
    expect(analysis.exposureInfoMap.get("SecureType")?.isAutoExposeDisabled).toBe(
      true
    );

    // Query should have isAutoExposeDisabled = false
    expect(analysis.exposureInfoMap.get("Query")?.isAutoExposeDisabled).toBe(
      false
    );
  });

  test("should handle schema with no @expose directives", () => {
    const schema = buildSchema(`
      type Query {
        hello: String
      }

      type User {
        id: ID!
        name: String!
      }
    `);

    const analysis = parseExposeDirectives(schema);

    // exposureInfoMap should have entries but with no explicit @expose fields
    expect(analysis.exposureInfoMap.size).toBeGreaterThan(0);

    // No types should have @expose directives on fields
    let hasExposedFields = false;
    for (const typeInfo of analysis.exposureInfoMap.values()) {
      if (typeInfo.fields.size > 0) {
        hasExposedFields = true;
      }
    }
    expect(hasExposedFields).toBe(false);

    // No types should have @disableAutoExpose
    let hasDisabledTypes = false;
    for (const typeInfo of analysis.exposureInfoMap.values()) {
      if (typeInfo.isAutoExposeDisabled) {
        hasDisabledTypes = true;
      }
    }
    expect(hasDisabledTypes).toBe(false);
  });

  test("should memoize results for same schema", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        test: String @expose(tags: ["admin"])
      }
    `);

    const result1 = parseExposeDirectives(schema);
    const result2 = parseExposeDirectives(schema);

    // Should return the same object (memoized)
    expect(result1).toBe(result2);
  });
});

describe("isFieldExposed", () => {
  test("should return true for fields with matching role tag", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        adminField: String @expose(tags: ["admin"])
      }
    `);

    const parsed = parseExposeDirectives(schema);

    expect(isFieldExposed(schema, parsed, "Query", "adminField", "admin")).toBe(
      true
    );
  });

  test("should return false for fields without matching role tag", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        adminField: String @expose(tags: ["admin"])
      }
    `);

    const parsed = parseExposeDirectives(schema);

    expect(isFieldExposed(schema, parsed, "Query", "adminField", "user")).toBe(
      false
    );
  });

  test("should return false for Query fields without @expose", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        publicField: String
      }
    `);

    const parsed = parseExposeDirectives(schema);

    // Query fields without @expose should be excluded
    expect(isFieldExposed(schema, parsed, "Query", "publicField", "user")).toBe(
      false
    );
  });

  test("should return true for non-root type fields without @expose (auto-expose)", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        user: User @expose(tags: ["user"])
      }

      type User {
        id: ID!
        name: String!
      }
    `);

    const parsed = parseExposeDirectives(schema);

    // User fields without @expose should be auto-exposed
    expect(isFieldExposed(schema, parsed, "User", "id", "user")).toBe(true);
    expect(isFieldExposed(schema, parsed, "User", "name", "user")).toBe(true);
  });

  test("should respect @disableAutoExpose directive", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION
      directive @disableAutoExpose on OBJECT | INTERFACE

      type Query {
        secure: SecureType @expose(tags: ["admin"])
      }

      type SecureType @disableAutoExpose {
        id: ID!
        secret: String @expose(tags: ["admin"])
      }
    `);

    const parsed = parseExposeDirectives(schema);

    // SecureType.id should not be auto-exposed
    expect(isFieldExposed(schema, parsed, "SecureType", "id", "admin")).toBe(
      false
    );

    // SecureType.secret should be exposed to admin
    expect(
      isFieldExposed(schema, parsed, "SecureType", "secret", "admin")
    ).toBe(true);
  });

  test("should handle empty tags array (explicitly excluded)", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        test: String @expose(tags: ["admin"])
      }

      type User {
        password: String @expose(tags: [])
      }
    `);

    const parsed = parseExposeDirectives(schema);

    // Field with empty tags should not be exposed to any role
    expect(isFieldExposed(schema, parsed, "User", "password", "admin")).toBe(
      false
    );
    expect(isFieldExposed(schema, parsed, "User", "password", "user")).toBe(
      false
    );
  });
});

describe("getExposedFields", () => {
  test("should return all exposed fields for a role", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION

      type Query {
        publicQuery: String @expose(tags: ["user", "admin"])
        adminQuery: String @expose(tags: ["admin"])
        userQuery: String @expose(tags: ["user"])
      }
    `);

    const parsed = parseExposeDirectives(schema);

    const adminFields = getExposedFields(schema, parsed, "Query", "admin");
    const userFields = getExposedFields(schema, parsed, "Query", "user");

    expect(adminFields.sort()).toEqual(["adminQuery", "publicQuery"].sort());
    expect(userFields.sort()).toEqual(["publicQuery", "userQuery"].sort());
  });

  test("should return auto-exposed fields for non-root types", () => {
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

    const parsed = parseExposeDirectives(schema);

    const userFieldsForUser = getExposedFields(schema, parsed, "User", "user");
    const userFieldsForAdmin = getExposedFields(
      schema,
      parsed,
      "User",
      "admin"
    );

    // User role should see id and name (auto-exposed), but not email
    expect(userFieldsForUser.sort()).toEqual(["id", "name"].sort());

    // Admin role should see all fields
    expect(userFieldsForAdmin.sort()).toEqual(["email", "id", "name"].sort());
  });

  test("should return empty array for non-existent type", () => {
    const schema = buildSchema(`
      type Query {
        test: String
      }
    `);

    const parsed = parseExposeDirectives(schema);

    const fields = getExposedFields(schema, parsed, "NonExistent", "user");

    expect(fields).toEqual([]);
  });

  test("should handle types with @disableAutoExpose", () => {
    const schema = buildSchema(`
      directive @expose(tags: [String!]!) on FIELD_DEFINITION
      directive @disableAutoExpose on OBJECT | INTERFACE

      type Query {
        secure: SecureType @expose(tags: ["admin"])
      }

      type SecureType @disableAutoExpose {
        id: ID!
        publicField: String @expose(tags: ["user", "admin"])
        adminField: String @expose(tags: ["admin"])
      }
    `);

    const parsed = parseExposeDirectives(schema);

    const userFields = getExposedFields(schema, parsed, "SecureType", "user");
    const adminFields = getExposedFields(schema, parsed, "SecureType", "admin");

    // User should only see publicField
    expect(userFields).toEqual(["publicField"]);

    // Admin should see both publicField and adminField
    expect(adminFields.sort()).toEqual(["adminField", "publicField"].sort());
  });
});
