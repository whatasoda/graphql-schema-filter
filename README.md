# graphql-schema-filter

GraphQL schema filtering library with `@expose` directive support for target-based access control.

## Features

- **Target-based filtering**: Filter GraphQL schemas based on `@expose` directive
- **Type reachability**: Automatically includes all referenced types via BFS traversal
- **Auto-discovery**: Infer entry points from `@expose` annotations on Query/Mutation fields
- **Zero runtime overhead**: Pure schema transformation at build/startup time
- **Directive definitions included**: Import ready-to-use directive definitions

## Packages

This monorepo contains the following packages:

| Package | Description |
| ------- | ----------- |
| [@graphql-schema-filter/core](./packages/core) | Core filtering library |
| [@graphql-schema-filter/schema-first-approach](./packages/schema-first-approach) | File-based schema loading for schema-first projects |

## Installation

### Core Package

```bash
npm install @graphql-schema-filter/core graphql
```

### Schema-First Approach

For projects using `.graphql` files (schema-first approach):

```bash
npm install @graphql-schema-filter/schema-first-approach graphql
```

## Quick Start

### 1. Define directives in your schema

```graphql
directive @expose(
  tags: [String!]!
) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
directive @disableAutoExpose on OBJECT | INTERFACE

type Query {
  users: [User!]! @expose(tags: ["readonly", "admin"])
  createUser(input: CreateUserInput!): User! @expose(tags: ["admin"])
}

type User {
  # Fields without @expose are auto-exposed (default public)
  id: ID!
  name: String!
  email: String!
  # Only admin can access
  salary: Float @expose(tags: ["admin"])
  # Explicitly excluded with empty tags
  password: String @expose(tags: [])
}

input CreateUserInput {
  name: String!
  email: String!
  # Only admin can set salary
  salary: Float @expose(tags: ["admin"])
  # Fields without @expose are included by default (permissive mode)
  password: String
}
```

### 2. Filter schema for a specific target

```typescript
import { filterSchema } from "@graphql-schema-filter/core";
import { buildSchema } from "graphql";

const schema = buildSchema(/* your schema */);

const filteredSchema = filterSchema(schema, {
  target: "readonly",
});
```

## How It Works

The library implements a 6-phase filtering pipeline:

1. **Parse** - Extract `@expose` directives from your GraphQL schema
2. **Infer Entry Points** - Identify Query/Mutation fields exposed to the target
3. **Compute Reachability** - BFS traversal to find all types referenced from entry points
4. **Convert to AST** - Transform schema to AST for manipulation
5. **Filter AST** - Remove unreachable types and unexposed fields
6. **Build Schema** - Create new GraphQL schema from filtered AST

## @expose Directive Rules

### Output Types (Object, Interface) - Default Public

For output types, fields **without `@expose` are auto-exposed** (default public):

```graphql
type User {
  # Auto-exposed (no @expose needed)
  id: ID!
  name: String!
  email: String!

  # Restrict to specific targets
  salary: Float @expose(tags: ["admin"])

  # Explicitly exclude with empty tags
  password: String @expose(tags: [])
}
```

**Default behavior:** Fields without `@expose` are **included** (auto-exposed). Use `@expose` to:

- **Restrict** fields to specific targets: `@expose(tags: ["admin"])`
- **Exclude** fields from all targets: `@expose(tags: [])`

### Query/Mutation Root Types - Explicit Required

For Query and Mutation root types, fields **must** have `@expose` to be accessible:

```graphql
type Query {
  # Must be explicitly marked
  users: [User!]! @expose(tags: ["readonly", "admin"])
  adminUsers: [User!]! @expose(tags: ["admin"])

  # Without @expose = not accessible
  internalQuery: String
}
```

**Default behavior:** Fields without `@expose` are **excluded**. This ensures only intended endpoints are exposed.

### @disableAutoExpose Directive

Apply to Object/Interface types to treat them like root types (explicit exposure required):

```graphql
type AdminQueries @disableAutoExpose {
  # Must be explicitly marked
  sensitiveData: String @expose(tags: ["admin"])

  # Without @expose = excluded
  internalData: String
}
```

**Use cases:**

- Nested query structures (delegated resolvers)
- Types that should require explicit field marking
- Security-sensitive types

### Input Types (InputObject) - Permissive Mode

For input types, the behavior is permissive to maintain API compatibility:

```graphql
input CreateUserInput {
  # Included by default
  name: String!
  email: String!

  # Restrict to specific targets
  salary: Float @expose(tags: ["admin"])

  # Still included (permissive)
  password: String
}
```

**Default behavior:** Fields without `@expose` are **included**. Use `@expose` only to **restrict** specific fields to certain targets.

## API Reference

### `filterSchema(schema, options)`

Main function to filter a GraphQL schema for a specific target.

```typescript
import { filterSchema } from "@graphql-schema-filter/core";

const filteredSchema = filterSchema(schema, {
  target: "admin",
});
```

**Parameters:**

- `schema`: `GraphQLSchema` - The schema to filter
- `options`: `FilterSchemaOptions`
  - `target`: `string` - Target identifier (e.g., "readonly", "admin")
  - `logLevel`: `LogLevel` - Log level (e.g., "debug", "info", "warn", "none") (default: "none")

**Returns:** `GraphQLSchema`

### Exported Types

```typescript
import type { FilterSchemaOptions } from "@graphql-schema-filter/core";
```

### Directive Definitions

The package includes a `directives.graphql` file with the directive definitions:

```
node_modules/@graphql-schema-filter/core/dist/directives.graphql
```

You can symlink this file to your project or copy the definitions to your schema as needed:

```bash
# Example: symlink to your schema directory
ln -s node_modules/@graphql-schema-filter/core/dist/directives.graphql src/graphql/directives.graphql
```

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Run tests
bun run test

# Type check
bun run typecheck
```

## License

MIT
