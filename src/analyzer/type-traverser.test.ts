import { describe, test, expect } from "bun:test";
import { buildSchema } from "graphql";
import {
  createTypeTraverserInternal,
  traverseGraphQLType,
} from "./type-traverser";

describe("createTypeTraverserInternal", () => {
  describe("traverseObject", () => {
    test("should yield output fields with return types and argument types", () => {
      const schema = buildSchema(`
        type Query {
          user(id: ID!): User
        }

        type User {
          id: ID!
          name: String!
          posts(limit: Int): [Post!]!
        }

        type Post {
          id: ID!
          title: String!
        }
      `);

      const traverser = createTypeTraverserInternal(schema);
      const userType = schema.getType("User");
      expect(userType).toBeDefined();

      const outputs = [...traverser.traverseObject(userType as any)];

      // Should yield 3 output fields (id, name, posts)
      expect(outputs.length).toBe(3);

      // Check id field
      const idOutput = outputs.find((o) => o.fieldName === "id");
      expect(idOutput).toBeDefined();
      expect(idOutput?.source).toBe("outputField");
      expect(idOutput?.fieldType.name).toBe("ID");
      expect(idOutput?.typeName).toBe("User");
      expect(idOutput?.children.length).toBe(1); // Return type only

      // Check posts field with argument
      const postsOutput = outputs.find((o) => o.fieldName === "posts");
      expect(postsOutput).toBeDefined();
      expect(postsOutput?.source).toBe("outputField");
      expect(postsOutput?.fieldType.name).toBe("Post");
      expect(postsOutput?.children.length).toBe(2); // Return type + argument type
      expect(postsOutput?.children.map((c) => c.name)).toContain("Int");
    });

    test("should yield implemented interfaces", () => {
      const schema = buildSchema(`
        type Query {
          node: Node
        }

        interface Node {
          id: ID!
        }

        type User implements Node {
          id: ID!
          name: String!
        }
      `);

      const traverser = createTypeTraverserInternal(schema);
      const userType = schema.getType("User");
      expect(userType).toBeDefined();

      const outputs = [...traverser.traverseObject(userType as any)];

      // Should have output fields + implemented interface
      const implementsOutputs = outputs.filter(
        (o) => o.source === "implementedInterface"
      );
      expect(implementsOutputs.length).toBe(1);
      expect(implementsOutputs[0].interfaceType.name).toBe("Node");
      expect(implementsOutputs[0].typeName).toBe("User");
    });
  });

  describe("traverseInterface", () => {
    test("should yield interface fields", () => {
      const schema = buildSchema(`
        type Query {
          node: Node
        }

        interface Node {
          id: ID!
          name: String!
        }

        type User implements Node {
          id: ID!
          name: String!
        }

        type Post implements Node {
          id: ID!
          name: String!
        }
      `);

      const traverser = createTypeTraverserInternal(schema);
      const nodeType = schema.getType("Node");
      expect(nodeType).toBeDefined();

      const outputs = [...traverser.traverseInterface(nodeType as any)];

      // Should yield 2 interface fields + 2 interface implementations
      const fieldOutputs = outputs.filter((o) => o.source === "interfaceField");
      expect(fieldOutputs.length).toBe(2);

      // Check field output
      const idOutput = fieldOutputs.find((o) => o.fieldName === "id");
      expect(idOutput).toBeDefined();
      expect(idOutput?.fieldType.name).toBe("ID");
      expect(idOutput?.typeName).toBe("Node");
    });
  });

  describe("traverseUnion", () => {
    test("should yield union member types", () => {
      const schema = buildSchema(`
        type Query {
          search: SearchResult
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

      const traverser = createTypeTraverserInternal(schema);
      const searchResultType = schema.getType("SearchResult");
      expect(searchResultType).toBeDefined();

      const outputs = [...traverser.traverseUnion(searchResultType as any)];

      // Should yield 2 union members
      expect(outputs.length).toBe(2);
      expect(outputs.every((o) => o.source === "unionMember")).toBe(true);

      const memberNames = outputs.map((o) => o.memberType.name).sort();
      expect(memberNames).toEqual(["Post", "User"]);

      // Check structure
      expect(outputs[0].unionName).toBe("SearchResult");
      expect(outputs[0].children.length).toBe(1);
      expect(outputs[0].children[0].name).toBe(outputs[0].memberType.name);
    });
  });

  describe("traverseInputObject", () => {
    test("should yield input field types", () => {
      const schema = buildSchema(`
        type Query {
          createUser(input: CreateUserInput!): User
        }

        input CreateUserInput {
          name: String!
          email: String!
          age: Int
        }

        type User {
          id: ID!
        }
      `);

      const traverser = createTypeTraverserInternal(schema);
      const inputType = schema.getType("CreateUserInput");
      expect(inputType).toBeDefined();

      const outputs = [...traverser.traverseInputObject(inputType as any)];

      // Should yield 3 input fields
      expect(outputs.length).toBe(3);
      expect(outputs.every((o) => o.source === "inputField")).toBe(true);

      // Check field names
      const fieldNames = outputs.map((o) => o.fieldName).sort();
      expect(fieldNames).toEqual(["age", "email", "name"]);

      // Check parent
      expect(outputs[0].typeName).toBe("CreateUserInput");

      // Check types
      const typeNames = outputs.map((o) => o.fieldType.name).sort();
      expect(typeNames).toEqual(["Int", "String", "String"]);
    });

    test("should handle nested input objects", () => {
      const schema = buildSchema(`
        type Query {
          createUser(input: CreateUserInput!): User
        }

        input CreateUserInput {
          name: String!
          profile: ProfileInput!
        }

        input ProfileInput {
          bio: String!
        }

        type User {
          id: ID!
        }
      `);

      const traverser = createTypeTraverserInternal(schema);
      const inputType = schema.getType("CreateUserInput");
      expect(inputType).toBeDefined();

      const outputs = [...traverser.traverseInputObject(inputType as any)];

      // Should yield 2 input fields
      expect(outputs.length).toBe(2);

      // Check nested input object
      const profileOutput = outputs.find((o) => o.fieldName === "profile");
      expect(profileOutput).toBeDefined();
      expect(profileOutput?.fieldType.name).toBe("ProfileInput");
    });
  });

  describe("traverseScalar", () => {
    test("should yield nothing for scalar types", () => {
      const schema = buildSchema(`
        type Query {
          hello: String
        }
      `);

      const traverser = createTypeTraverserInternal(schema);
      const stringType = schema.getType("String");
      expect(stringType).toBeDefined();

      const outputs = [...traverser.traverseScalar(stringType as any)];

      // Scalar types have no children
      expect(outputs.length).toBe(0);
    });
  });

  describe("traverseEnum", () => {
    test("should yield nothing for enum types", () => {
      const schema = buildSchema(`
        type Query {
          status: Status
        }

        enum Status {
          ACTIVE
          INACTIVE
        }
      `);

      const traverser = createTypeTraverserInternal(schema);
      const statusType = schema.getType("Status");
      expect(statusType).toBeDefined();

      const outputs = [...traverser.traverseEnum(statusType as any)];

      // Enum types have no children
      expect(outputs.length).toBe(0);
    });
  });

  describe("traverseNamedType", () => {
    test("should dispatch to correct traversal method based on type kind", () => {
      const schema = buildSchema(`
        type Query {
          user: User
          search: SearchResult
        }

        type User {
          id: ID!
        }

        union SearchResult = User
      `);

      const traverser = createTypeTraverserInternal(schema);

      // Test Object type
      const userType = schema.getType("User");
      const userOutputs = [...traverser.traverseNamedType(userType as any)];
      expect(userOutputs.length).toBeGreaterThan(0);
      expect(
        userOutputs.every(
          (o) =>
            o.source === "outputField" || o.source === "implementedInterface"
        )
      ).toBe(true);

      // Test Union type
      const searchType = schema.getType("SearchResult");
      const searchOutputs = [...traverser.traverseNamedType(searchType as any)];
      expect(searchOutputs.length).toBeGreaterThan(0);
      expect(searchOutputs.every((o) => o.source === "unionMember")).toBe(true);

      // Test Scalar type
      const stringType = schema.getType("String");
      const stringOutputs = [...traverser.traverseNamedType(stringType as any)];
      expect(stringOutputs.length).toBe(0);
    });
  });
});

describe("traverseGraphQLType", () => {
  test("should traverse reachable types from entry points", () => {
    const schema = buildSchema(`
      type Query {
        user: User
      }

      type User {
        id: ID!
        name: String!
        posts: [Post!]!
      }

      type Post {
        id: ID!
        title: String!
      }
    `);

    const userType = schema.getType("User");
    expect(userType).toBeDefined();

    const types = [
      ...traverseGraphQLType({
        schema,
        entrypoints: [userType as any],
        filter: () => true,
      }),
    ];

    // Should include User, Post, and scalars
    const typeNames = types.map((t) => t.name);
    expect(typeNames).toContain("User");
    expect(typeNames).toContain("Post");
    expect(typeNames).toContain("ID");
    expect(typeNames).toContain("String");
  });

  test("should respect filter function", () => {
    const schema = buildSchema(`
      type Query {
        user: User
      }

      type User {
        id: ID!
        name: String!
        secret: String!
      }
    `);

    const userType = schema.getType("User");
    expect(userType).toBeDefined();

    // Filter out "secret" field
    const types = [
      ...traverseGraphQLType({
        schema,
        entrypoints: [userType as any],
        filter: (output) => {
          if (
            output.source === "outputField" &&
            output.fieldName === "secret"
          ) {
            return false;
          }
          return true;
        },
      }),
    ];

    // Should include User, ID, String (from id and name fields)
    // "secret" field is filtered, but String is already discovered from "name"
    const typeNames = types.map((t) => t.name);
    expect(typeNames).toContain("User");
    expect(typeNames).toContain("String");
  });

  test("should avoid visiting the same type twice", () => {
    const schema = buildSchema(`
      type Query {
        user: User
      }

      type User {
        id: ID!
        name: String!
        friends: [User!]!
      }
    `);

    const userType = schema.getType("User");
    expect(userType).toBeDefined();

    const types = [
      ...traverseGraphQLType({
        schema,
        entrypoints: [userType as any],
        filter: () => true,
      }),
    ];

    // Count how many times "User" appears
    const userCount = types.filter((t) => t.name === "User").length;

    // Should only visit User once (no duplicates)
    expect(userCount).toBe(1);
  });

  test("should skip introspection types", () => {
    const schema = buildSchema(`
      type Query {
        user: User
      }

      type User {
        id: ID!
      }
    `);

    const userType = schema.getType("User");
    const schemaType = schema.getType("__Schema");
    expect(userType).toBeDefined();
    expect(schemaType).toBeDefined();

    const types = [
      ...traverseGraphQLType({
        schema,
        entrypoints: [userType as any, schemaType as any],
        filter: () => true,
      }),
    ];

    // Should not include introspection types
    const typeNames = types.map((t) => t.name);
    expect(typeNames).toContain("User");
    expect(typeNames).not.toContain("__Schema");
  });

  test("should handle multiple entry points", () => {
    const schema = buildSchema(`
      type Query {
        user: User
        post: Post
      }

      type User {
        id: ID!
        name: String!
      }

      type Post {
        id: ID!
        title: String!
      }
    `);

    const userType = schema.getType("User");
    const postType = schema.getType("Post");
    expect(userType).toBeDefined();
    expect(postType).toBeDefined();

    const types = [
      ...traverseGraphQLType({
        schema,
        entrypoints: [userType as any, postType as any],
        filter: () => true,
      }),
    ];

    // Should include both User and Post
    const typeNames = types.map((t) => t.name);
    expect(typeNames).toContain("User");
    expect(typeNames).toContain("Post");
  });

  test("should handle empty entry points", () => {
    const schema = buildSchema(`
      type Query {
        hello: String
      }
    `);

    const types = [
      ...traverseGraphQLType({
        schema,
        entrypoints: [],
        filter: () => true,
      }),
    ];

    // Should yield no types
    expect(types.length).toBe(0);
  });
});
