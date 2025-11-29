import { describe, test, expect } from "bun:test";
import { buildSchema } from "graphql";
import { createSchemaAnalysis } from "./schema-analysis";

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

    const analysis = createSchemaAnalysis(schema);

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

    const analysis = createSchemaAnalysis(schema);

    // SecureType should have isAutoExposeDisabled = true
    expect(
      analysis.exposureInfoMap.get("SecureType")?.isAutoExposeDisabled
    ).toBe(true);

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

    const analysis = createSchemaAnalysis(schema);

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
});
