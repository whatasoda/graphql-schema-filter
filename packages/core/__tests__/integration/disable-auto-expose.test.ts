import { describe, test, expect } from "bun:test";
import { buildSchema } from "graphql";
import { filterSchema } from "../../src";
import { checkType, checkField, schemaContains } from "../helpers";

describe("@disableAutoExpose directive", () => {
  const schema = buildSchema(`
    directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
    directive @disableAutoExpose on OBJECT | INTERFACE

    type Query {
      user: UserQueries @expose(tags: ["public", "authenticated"])
      admin: AdminQueries @expose(tags: ["admin"])
    }

    # With @disableAutoExpose, fields without @expose are excluded
    type UserQueries @disableAutoExpose {
      me: User @expose(tags: ["authenticated"])
      profile(id: ID!): User @expose(tags: ["public"])
      # Excluded (no @expose)
      internalUserLookup(email: String!): User
    }

    type AdminQueries @disableAutoExpose {
      users: [User!]! @expose(tags: ["admin"])
      analytics: Analytics @expose(tags: ["admin"])
      # Excluded (no @expose)
      debugInfo: String
    }

    # Normal type (default public)
    type User {
      id: ID!
      name: String!
      email: String!
    }

    type Analytics {
      totalUsers: Int!
      activeUsers: Int!
    }
  `);

  test("should filter schema for public target", async () => {
    const filteredSchema = filterSchema(schema, {
      target: "public",
    });

    // Query.user should be included, Query.admin should not
    expect(checkField(filteredSchema, "Query", "user")).toBe("exists");
    expect(checkField(filteredSchema, "Query", "admin")).toBe(
      "field-not-found"
    );

    // UserQueries: only profile should be included (public tag)
    // Note: me is exposed to "authenticated" only, not "public"
    expect(schemaContains(filteredSchema, "profile(id: ID!): User")).toBe(true);
    expect(
      checkField(filteredSchema, "UserQueries", "internalUserLookup")
    ).toBe("field-not-found");

    // User type should be included
    expect(checkType(filteredSchema, "User")).toBe("exists");

    // AdminQueries and Analytics should not be reachable
    expect(checkType(filteredSchema, "AdminQueries")).toBe("not-found");
    expect(checkType(filteredSchema, "Analytics")).toBe("not-found");

    // Verify UserQueries fields directly
    expect(checkField(filteredSchema, "UserQueries", "profile")).toBe("exists");
    expect(checkField(filteredSchema, "UserQueries", "me")).toBe(
      "field-not-found"
    );
    expect(
      checkField(filteredSchema, "UserQueries", "internalUserLookup")
    ).toBe("field-not-found");
  });

  test("should filter schema for authenticated target", async () => {
    const filteredSchema = filterSchema(schema, {
      target: "authenticated",
    });

    // Query.user should be included (authenticated is in the tags)
    expect(checkField(filteredSchema, "Query", "user")).toBe("exists");

    // UserQueries: me should be included (authenticated tag)
    expect(checkField(filteredSchema, "UserQueries", "me")).toBe("exists");
    expect(
      checkField(filteredSchema, "UserQueries", "internalUserLookup")
    ).toBe("field-not-found");

    // User type should be included
    expect(checkType(filteredSchema, "User")).toBe("exists");

    // Verify UserQueries fields directly
    expect(checkField(filteredSchema, "UserQueries", "me")).toBe("exists");
    expect(checkField(filteredSchema, "UserQueries", "profile")).toBe(
      "field-not-found"
    );
    expect(
      checkField(filteredSchema, "UserQueries", "internalUserLookup")
    ).toBe("field-not-found");
  });

  test("should filter schema for admin target", async () => {
    const filteredSchema = filterSchema(schema, {
      target: "admin",
    });

    // Query.admin should be included
    expect(checkField(filteredSchema, "Query", "admin")).toBe("exists");

    // AdminQueries: users and analytics should be included, debugInfo excluded
    expect(schemaContains(filteredSchema, "users: [User!]!")).toBe(true);
    expect(checkField(filteredSchema, "AdminQueries", "analytics")).toBe(
      "exists"
    );
    expect(checkField(filteredSchema, "AdminQueries", "debugInfo")).toBe(
      "field-not-found"
    );

    // Analytics type should be reachable
    expect(checkType(filteredSchema, "Analytics")).toBe("exists");
    expect(checkField(filteredSchema, "Analytics", "totalUsers")).toBe(
      "exists"
    );
    expect(checkField(filteredSchema, "Analytics", "activeUsers")).toBe(
      "exists"
    );
  });

  test("should exclude internalUserLookup for all targets", async () => {
    const targets = ["public", "authenticated", "admin"];

    for (const target of targets) {
      const filteredSchema = filterSchema(schema, {
        target,
      });

      // internalUserLookup should never be included (no @expose on @disableAutoExpose type)
      // Note: UserQueries might not exist for admin target
      const result = checkField(
        filteredSchema,
        "UserQueries",
        "internalUserLookup"
      );
      expect(result === "field-not-found" || result === "type-not-found").toBe(
        true
      );
    }
  });

  test("should have correct UserQueries fields for each target", async () => {
    const publicSchema = filterSchema(schema, {
      target: "public",
    });
    const authSchema = filterSchema(schema, {
      target: "authenticated",
    });

    // Public target
    expect(checkField(publicSchema, "UserQueries", "profile")).toBe("exists");
    expect(checkField(publicSchema, "UserQueries", "me")).toBe(
      "field-not-found"
    );
    expect(checkField(publicSchema, "UserQueries", "internalUserLookup")).toBe(
      "field-not-found"
    );

    // Authenticated target
    expect(checkField(authSchema, "UserQueries", "me")).toBe("exists");
    expect(checkField(authSchema, "UserQueries", "profile")).toBe(
      "field-not-found"
    );
    expect(checkField(authSchema, "UserQueries", "internalUserLookup")).toBe(
      "field-not-found"
    );
  });
});
