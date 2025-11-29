import { describe, test, expect } from "bun:test";
import {
  buildSchema,
  printSchema,
  type GraphQLObjectType,
} from "graphql";
import { filterSchemaForTarget } from "../../src";

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
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "public",
    });
    const filteredSchemaStr = printSchema(filteredSchema);

    // Query.user should be included, Query.admin should not
    expect(filteredSchemaStr).toContain("user: UserQueries");
    expect(filteredSchemaStr).not.toContain("admin: AdminQueries");

    // UserQueries: only profile should be included (public tag)
    // Note: me is exposed to "authenticated" only, not "public"
    expect(filteredSchemaStr).toContain("profile(id: ID!): User");
    expect(filteredSchemaStr).not.toContain("internalUserLookup:");

    // User type should be included
    expect(filteredSchemaStr).toContain("type User");

    // AdminQueries and Analytics should not be reachable
    expect(filteredSchemaStr).not.toContain("AdminQueries");
    expect(filteredSchemaStr).not.toContain("Analytics");

    // Verify UserQueries fields directly
    const userQueries = filteredSchema.getType("UserQueries") as GraphQLObjectType | undefined;
    if (userQueries) {
      const fields = Object.keys(userQueries.getFields());
      expect(fields).toContain("profile");
      expect(fields).not.toContain("me");
      expect(fields).not.toContain("internalUserLookup");
    }
  });

  test("should filter schema for authenticated target", async () => {
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "authenticated",
    });
    const filteredSchemaStr = printSchema(filteredSchema);

    // Query.user should be included (authenticated is in the tags)
    expect(filteredSchemaStr).toContain("user: UserQueries");

    // UserQueries: me should be included (authenticated tag)
    expect(filteredSchemaStr).toContain("me: User");
    expect(filteredSchemaStr).not.toContain("internalUserLookup:");

    // User type should be included
    expect(filteredSchemaStr).toContain("type User");

    // Verify UserQueries fields directly
    const userQueries = filteredSchema.getType("UserQueries") as GraphQLObjectType | undefined;
    if (userQueries) {
      const fields = Object.keys(userQueries.getFields());
      expect(fields).toContain("me");
      expect(fields).not.toContain("profile");
      expect(fields).not.toContain("internalUserLookup");
    }
  });

  test("should filter schema for admin target", async () => {
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "admin",
    });
    const filteredSchemaStr = printSchema(filteredSchema);

    // Query.admin should be included
    expect(filteredSchemaStr).toContain("admin: AdminQueries");

    // AdminQueries: users and analytics should be included, debugInfo excluded
    expect(filteredSchemaStr).toContain("users: [User!]!");
    expect(filteredSchemaStr).toContain("analytics: Analytics");
    expect(filteredSchemaStr).not.toContain("debugInfo:");

    // Analytics type should be reachable
    expect(filteredSchemaStr).toContain("type Analytics");
    expect(filteredSchemaStr).toContain("totalUsers: Int!");
    expect(filteredSchemaStr).toContain("activeUsers: Int!");
  });

  test("should exclude internalUserLookup for all targets", async () => {
    const targets = ["public", "authenticated", "admin"];

    for (const target of targets) {
      const filteredSchema = await filterSchemaForTarget(schema, {
        target,
      });
      const filteredSchemaStr = printSchema(filteredSchema);

      // internalUserLookup should never be included (no @expose on @disableAutoExpose type)
      expect(filteredSchemaStr).not.toContain("internalUserLookup");
    }
  });

  test("should have correct UserQueries fields for each target", async () => {
    const publicSchema = await filterSchemaForTarget(schema, {
      target: "public",
    });
    const authSchema = await filterSchemaForTarget(schema, {
      target: "authenticated",
    });

    const publicUserQueries = publicSchema.getType(
      "UserQueries"
    ) as GraphQLObjectType | undefined;
    const authUserQueries = authSchema.getType(
      "UserQueries"
    ) as GraphQLObjectType | undefined;

    if (publicUserQueries) {
      const fields = Object.keys(publicUserQueries.getFields());
      expect(fields).toContain("profile");
      expect(fields).not.toContain("me");
      expect(fields).not.toContain("internalUserLookup");
    }

    if (authUserQueries) {
      const fields = Object.keys(authUserQueries.getFields());
      expect(fields).toContain("me");
      expect(fields).not.toContain("profile");
      expect(fields).not.toContain("internalUserLookup");
    }
  });
});
