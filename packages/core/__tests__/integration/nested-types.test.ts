import { describe, test, expect } from "bun:test";
import { buildSchema } from "graphql";
import { filterSchemaForTarget } from "../../src";
import {
  checkType,
  checkField,
  getVisibleTypeNames,
  schemaContains,
} from "../helpers";

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

    // Query.organization should be included
    expect(
      schemaContains(filteredSchema, "organization(id: ID!): Organization")
    ).toBe(true);

    // Organization: teams should be included, billing should not
    expect(schemaContains(filteredSchema, "teams: [Team!]!")).toBe(true);
    expect(checkField(filteredSchema, "Organization", "billing")).toBe(
      "field-not-found"
    );

    // Team: members should be included, privateNotes should not
    expect(schemaContains(filteredSchema, "members: [User!]!")).toBe(true);
    expect(checkField(filteredSchema, "Team", "privateNotes")).toBe(
      "field-not-found"
    );

    // User should be fully included (all fields are default public)
    expect(checkType(filteredSchema, "User")).toBe("exists");
    expect(checkField(filteredSchema, "User", "manager")).toBe("exists");
    expect(checkField(filteredSchema, "User", "directReports")).toBe("exists");

    // BillingInfo should not be reachable
    expect(checkType(filteredSchema, "BillingInfo")).toBe("not-found");
  });

  test("should filter schema for admin target", async () => {
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "admin",
    });

    // Organization: billing should be included for admin
    expect(checkField(filteredSchema, "Organization", "billing")).toBe("exists");

    // Team: privateNotes should be included for admin
    expect(checkField(filteredSchema, "Team", "privateNotes")).toBe("exists");

    // BillingInfo should be reachable
    expect(checkType(filteredSchema, "BillingInfo")).toBe("exists");
    expect(checkField(filteredSchema, "BillingInfo", "plan")).toBe("exists");
    expect(checkField(filteredSchema, "BillingInfo", "creditCard")).toBe(
      "exists"
    );
    // internalNotes should be excluded (empty tags)
    expect(checkField(filteredSchema, "BillingInfo", "internalNotes")).toBe(
      "field-not-found"
    );
  });

  test("should filter schema for team-lead target", async () => {
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "team-lead",
    });

    // Team: privateNotes should be included for team-lead
    expect(checkField(filteredSchema, "Team", "privateNotes")).toBe("exists");

    // Organization: billing should not be included (admin only)
    expect(checkField(filteredSchema, "Organization", "billing")).toBe(
      "field-not-found"
    );

    // BillingInfo should not be reachable
    expect(checkType(filteredSchema, "BillingInfo")).toBe("not-found");
  });

  test("should have correct reachable types for each target", async () => {
    const memberSchema = await filterSchemaForTarget(schema, {
      target: "member",
    });
    const adminSchema = await filterSchemaForTarget(schema, {
      target: "admin",
    });

    const memberTypes = getVisibleTypeNames(memberSchema);
    const adminTypes = getVisibleTypeNames(adminSchema);

    // member: should not include BillingInfo
    expect(checkType(memberSchema, "BillingInfo")).toBe("not-found");
    expect(checkType(memberSchema, "Organization")).toBe("exists");
    expect(checkType(memberSchema, "Team")).toBe("exists");
    expect(checkType(memberSchema, "User")).toBe("exists");

    // admin: should include BillingInfo
    expect(checkType(adminSchema, "BillingInfo")).toBe("exists");
    expect(checkType(adminSchema, "Organization")).toBe("exists");
    expect(checkType(adminSchema, "Team")).toBe("exists");
    expect(checkType(adminSchema, "User")).toBe("exists");

    // admin should have more types than member
    expect(adminTypes.length).toBeGreaterThan(memberTypes.length);
  });

  test("should handle self-referencing types correctly", async () => {
    const filteredSchema = await filterSchemaForTarget(schema, {
      target: "member",
    });

    // Self-reference fields should be preserved
    expect(checkField(filteredSchema, "User", "manager")).toBe("exists");
    expect(checkField(filteredSchema, "User", "directReports")).toBe("exists");

    // Should not cause infinite loops - schema should be valid
    expect(checkType(filteredSchema, "User")).toBe("exists");
  });
});
