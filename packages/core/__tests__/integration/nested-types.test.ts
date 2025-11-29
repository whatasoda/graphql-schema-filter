import { describe, test, expect } from "bun:test";
import { buildSchema, printSchema } from "graphql";
import { filterSchemaForTarget } from "../../src";

describe("nested types and relations", () => {
  const schema = buildSchema(`
    directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
    directive @disableAutoExpose on OBJECT | INTERFACE

    type Query {
      organization(id: ID!): Organization @expose(tags: ["member", "team-lead", "admin"])
    }

    type Organization {
      id: ID!
      name: String!
      # Nested relation (default public)
      teams: [Team!]!
      # admin only
      billing: BillingInfo @expose(tags: ["admin"])
    }

    type Team {
      id: ID!
      name: String!
      members: [User!]!
      # team-lead and above
      privateNotes: String @expose(tags: ["team-lead", "admin"])
    }

    type User {
      id: ID!
      name: String!
      email: String!
      # Self-reference
      manager: User
      directReports: [User!]
    }

    type BillingInfo {
      plan: String!
      # Default public (intentional - included when type is reachable)
      creditCard: String
      # Explicitly excluded
      internalNotes: String @expose(tags: [])
    }
  `);

  test("should filter schema for member target", async () => {
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "member",
    });
    const filteredSchemaStr = printSchema(filteredSchema);

    // Query.organization should be included
    expect(filteredSchemaStr).toContain("organization(id: ID!): Organization");

    // Organization: teams should be included, billing should not
    expect(filteredSchemaStr).toContain("teams: [Team!]!");
    expect(filteredSchemaStr).not.toContain("billing:");

    // Team: members should be included, privateNotes should not
    expect(filteredSchemaStr).toContain("members: [User!]!");
    expect(filteredSchemaStr).not.toContain("privateNotes:");

    // User should be fully included (all fields are default public)
    expect(filteredSchemaStr).toContain("type User");
    expect(filteredSchemaStr).toContain("manager: User");
    expect(filteredSchemaStr).toContain("directReports: [User!]");

    // BillingInfo should not be reachable
    expect(filteredSchemaStr).not.toContain("BillingInfo");
  });

  test("should filter schema for admin target", async () => {
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "admin",
    });
    const filteredSchemaStr = printSchema(filteredSchema);

    // Organization: billing should be included for admin
    expect(filteredSchemaStr).toContain("billing: BillingInfo");

    // Team: privateNotes should be included for admin
    expect(filteredSchemaStr).toContain("privateNotes: String");

    // BillingInfo should be reachable
    expect(filteredSchemaStr).toContain("type BillingInfo");
    expect(filteredSchemaStr).toContain("plan: String!");
    expect(filteredSchemaStr).toContain("creditCard: String");
    // internalNotes should be excluded (empty tags)
    expect(filteredSchemaStr).not.toContain("internalNotes:");
  });

  test("should filter schema for team-lead target", async () => {
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "team-lead",
    });
    const filteredSchemaStr = printSchema(filteredSchema);

    // Team: privateNotes should be included for team-lead
    expect(filteredSchemaStr).toContain("privateNotes: String");

    // Organization: billing should not be included (admin only)
    expect(filteredSchemaStr).not.toContain("billing:");

    // BillingInfo should not be reachable
    expect(filteredSchemaStr).not.toContain("BillingInfo");
  });

  test("should have correct reachable types for each target", async () => {
    const memberSchema = await filterSchemaForTarget(schema, {
      target: "member",
    });
    const adminSchema = await filterSchemaForTarget(schema, {
      target: "admin",
    });

    const memberTypes = Object.keys(memberSchema.getTypeMap()).filter(
      (name) => !name.startsWith("__")
    );
    const adminTypes = Object.keys(adminSchema.getTypeMap()).filter(
      (name) => !name.startsWith("__")
    );

    // member: should not include BillingInfo
    expect(memberTypes).not.toContain("BillingInfo");
    expect(memberTypes).toContain("Organization");
    expect(memberTypes).toContain("Team");
    expect(memberTypes).toContain("User");

    // admin: should include BillingInfo
    expect(adminTypes).toContain("BillingInfo");
    expect(adminTypes).toContain("Organization");
    expect(adminTypes).toContain("Team");
    expect(adminTypes).toContain("User");

    // admin should have more types than member
    expect(adminTypes.length).toBeGreaterThan(memberTypes.length);
  });

  test("should handle self-referencing types correctly", async () => {
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "member",
    });
    const filteredSchemaStr = printSchema(filteredSchema);

    // Self-reference fields should be preserved
    expect(filteredSchemaStr).toContain("manager: User");
    expect(filteredSchemaStr).toContain("directReports: [User!]");

    // Should not cause infinite loops - schema should be valid
    expect(filteredSchema.getType("User")).toBeDefined();
  });
});
