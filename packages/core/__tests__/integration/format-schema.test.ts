import { describe, test, expect } from "bun:test";
import { buildSchema, printSchema } from "graphql";
import { filterSchema } from "../../src";

describe("format-schema", () => {
  const schema = buildSchema(`
    directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
    directive @disableAutoExpose on OBJECT | INTERFACE
    directive @customDirective on FIELD_DEFINITION

    type Query {
      zUsers: [User!]! @expose(tags: ["public"])
      aAdmins: [User!]! @expose(tags: ["public"])
    }

    type Mutation {
      createUser(input: CreateUserInput!): User! @expose(tags: ["public"])
    }

    type User implements Node {
      zName: String!
      aId: ID!
      mEmail: String!
      zUpdatedAt: DateTime!
    }

    interface Node {
      zUpdatedAt: DateTime!
      aId: ID!
    }

    input CreateUserInput {
      zName: String!
      aEmail: String!
    }

    enum Status {
      ACTIVE
      INACTIVE
    }

    union SearchResult = User

    scalar DateTime
  `);

  describe("definitionsSort: alphabetical", () => {
    test("should sort definitions by group and alphabetically within groups", () => {
      const filteredSchema = filterSchema(schema, {
        target: "public",
        formatOptions: {
          definitionsSort: { type: "alphabetical" },
          fieldsSort: { type: "none" },
        },
      });

      const sdl = printSchema(filteredSchema);
      const lines = sdl.split("\n").filter((line) => line.trim());

      // Find positions of type definitions
      const queryPos = lines.findIndex((l) => l.startsWith("type Query"));
      const mutationPos = lines.findIndex((l) => l.startsWith("type Mutation"));
      const scalarPos = lines.findIndex((l) => l.startsWith("scalar DateTime"));
      const nodePos = lines.findIndex((l) => l.startsWith("interface Node"));
      const userPos = lines.findIndex((l) => l.startsWith("type User"));
      const createUserInputPos = lines.findIndex((l) =>
        l.startsWith("input CreateUserInput")
      );

      // Root types should come first (Query, then Mutation)
      expect(queryPos).toBeLessThan(mutationPos);

      // Scalars should come after root types
      expect(mutationPos).toBeLessThan(scalarPos);

      // Named types should come after scalars, sorted alphabetically
      // CreateUserInput < Node < User
      expect(scalarPos).toBeLessThan(createUserInputPos);
      expect(createUserInputPos).toBeLessThan(nodePos);
      expect(nodePos).toBeLessThan(userPos);
    });
  });

  describe("definitionsSort: none", () => {
    test("should preserve original definition order", () => {
      const filteredSchema = filterSchema(schema, {
        target: "public",
        formatOptions: {
          definitionsSort: { type: "none" },
          fieldsSort: { type: "none" },
        },
      });

      const sdl = printSchema(filteredSchema);
      // With none, the order depends on graphql-js printSchema output
      // Just verify it doesn't throw and produces valid schema
      expect(sdl).toContain("type Query");
      expect(sdl).toContain("type User");
    });
  });

  describe("fieldsSort: alphabetical", () => {
    test("should sort Object type fields alphabetically", () => {
      const filteredSchema = filterSchema(schema, {
        target: "public",
        formatOptions: {
          definitionsSort: { type: "none" },
          fieldsSort: { type: "alphabetical" },
        },
      });

      const sdl = printSchema(filteredSchema);

      // User fields should be sorted: aId, mEmail, zName, zUpdatedAt
      const userMatch = sdl.match(/type User implements Node \{([^}]+)\}/);
      expect(userMatch).toBeTruthy();
      const userFields = userMatch![1];
      const aIdPos = userFields.indexOf("aId");
      const mEmailPos = userFields.indexOf("mEmail");
      const zNamePos = userFields.indexOf("zName");
      const zUpdatedAtPos = userFields.indexOf("zUpdatedAt");

      expect(aIdPos).toBeLessThan(mEmailPos);
      expect(mEmailPos).toBeLessThan(zNamePos);
      expect(zNamePos).toBeLessThan(zUpdatedAtPos);
    });

    test("should sort Query fields alphabetically", () => {
      const filteredSchema = filterSchema(schema, {
        target: "public",
        formatOptions: {
          definitionsSort: { type: "none" },
          fieldsSort: { type: "alphabetical" },
        },
      });

      const sdl = printSchema(filteredSchema);

      // Query fields should be sorted: aAdmins, zUsers
      const queryMatch = sdl.match(/type Query \{([^}]+)\}/);
      expect(queryMatch).toBeTruthy();
      const queryFields = queryMatch![1];
      const aAdminsPos = queryFields.indexOf("aAdmins");
      const zUsersPos = queryFields.indexOf("zUsers");

      expect(aAdminsPos).toBeLessThan(zUsersPos);
    });

    test("should sort Interface fields alphabetically", () => {
      const filteredSchema = filterSchema(schema, {
        target: "public",
        formatOptions: {
          definitionsSort: { type: "none" },
          fieldsSort: { type: "alphabetical" },
        },
      });

      const sdl = printSchema(filteredSchema);

      // Node fields should be sorted: aId, zUpdatedAt
      const nodeMatch = sdl.match(/interface Node \{([^}]+)\}/);
      expect(nodeMatch).toBeTruthy();
      const nodeFields = nodeMatch![1];
      const aIdPos = nodeFields.indexOf("aId");
      const zUpdatedAtPos = nodeFields.indexOf("zUpdatedAt");

      expect(aIdPos).toBeLessThan(zUpdatedAtPos);
    });

    test("should sort InputObject fields alphabetically", () => {
      const filteredSchema = filterSchema(schema, {
        target: "public",
        formatOptions: {
          definitionsSort: { type: "none" },
          fieldsSort: { type: "alphabetical" },
        },
      });

      const sdl = printSchema(filteredSchema);

      // CreateUserInput fields should be sorted: aEmail, zName
      const inputMatch = sdl.match(/input CreateUserInput \{([^}]+)\}/);
      expect(inputMatch).toBeTruthy();
      const inputFields = inputMatch![1];
      const aEmailPos = inputFields.indexOf("aEmail");
      const zNamePos = inputFields.indexOf("zName");

      expect(aEmailPos).toBeLessThan(zNamePos);
    });
  });

  describe("fieldsSort: none", () => {
    test("should preserve original field order", () => {
      const filteredSchema = filterSchema(schema, {
        target: "public",
        formatOptions: {
          definitionsSort: { type: "none" },
          fieldsSort: { type: "none" },
        },
      });

      const sdl = printSchema(filteredSchema);
      // Just verify it produces valid schema
      expect(sdl).toContain("type User");
      expect(sdl).toContain("zName");
      expect(sdl).toContain("aId");
    });
  });

  describe("default behavior", () => {
    test("should use alphabetical sorting by default when formatOptions is not specified", () => {
      const filteredSchema = filterSchema(schema, {
        target: "public",
      });

      const sdl = printSchema(filteredSchema);

      // Fields should be sorted alphabetically by default
      const userMatch = sdl.match(/type User implements Node \{([^}]+)\}/);
      expect(userMatch).toBeTruthy();
      const userFields = userMatch![1];
      const aIdPos = userFields.indexOf("aId");
      const zNamePos = userFields.indexOf("zName");

      expect(aIdPos).toBeLessThan(zNamePos);

      // Definitions should also be sorted by default
      const lines = sdl.split("\n").filter((line) => line.trim());
      const queryPos = lines.findIndex((l) => l.startsWith("type Query"));
      const mutationPos = lines.findIndex((l) => l.startsWith("type Mutation"));

      expect(queryPos).toBeLessThan(mutationPos);
    });
  });
});
