# graphql-schema-extract

GraphQL schema filtering library with `@expose` directive support for target-based access control.

## Features

- 🔒 **Role-based filtering**: Filter GraphQL schemas based on `@expose` directive
- 🔍 **Type reachability**: Automatically includes all referenced types
- 🎯 **Auto-discovery**: Infer entry points from `@expose` annotations
- 📦 **Zero runtime overhead**: Pure schema transformation
- 🔧 **Highly configurable**: Customize filtering behavior

## Installation

```bash
# This library is currently private
# Future: npm install graphql-schema-extract
```

## Quick Start

### 1. Define directives in your schema

```graphql
directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
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
import { filterSchemaForTarget } from "graphql-schema-extract";
import { buildSchema } from "graphql";

const schema = buildSchema(/* your schema */);

const filteredSchema = await filterSchemaForTarget(schema, {
  target: "readonly",
  autoInferEntryPoints: true,
});
```

## How It Works

The library implements a type reachability closure algorithm:

1. **Parse @expose directives** from your GraphQL schema
2. **Infer entry points** - Query/Mutation fields marked with `@expose` for the target
3. **Compute reachability** - BFS traversal to find all types referenced from entry points
4. **Filter fields** - Remove fields not exposed to the target
5. **Rebuild schema** - Create new GraphQL schema with filtered types

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
- **Exclude** fields from all roles: `@expose(tags: [])`

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

**Default behavior:** Fields without `@expose` are **included**. Use `@expose` only to **restrict** specific fields to certain roles.

## API Reference

### `filterSchemaForTarget(schema, options)`

Main function to filter a GraphQL schema for a specific target.

**Parameters:**

- `schema`: GraphQLSchema - The schema to filter
- `options`: FilterSchemaOptions
  - `target`: string - Target name (e.g., "readonly", "admin")
  - `autoInferEntryPoints?`: boolean - Auto-detect entry points from @expose (default: true)
  - `entryPoints?`: object - Manual entry points (queries, mutations, types)
  - `reachabilityConfig?`: Partial<ReachabilityConfig> - Reachability analysis options
  - `filterConfig?`: Partial<SchemaFilterConfig> - Field retention options

**Returns:** Promise<GraphQLSchema>

### Classes

#### `ReachabilityAnalyzer`

Computes type reachability closure using BFS.

#### `ExposeParser`

Parses `@expose` directives from GraphQL schema AST.

#### `SchemaFilter`

Rebuilds GraphQL schema with filtered fields.

## Configuration

### ReachabilityConfig

```typescript
{
  // Include Interface implementations (default: true)
  includeInterfaceImplementations: boolean;

  // How to include referenced types (default: 'all')
  includeReferenced: "all" | "args-only" | "none";
}
```

### SchemaFilterConfig

```typescript
{
  // Field retention policy (default: 'exposed-only')
  fieldRetention: "exposed-only" | "all-for-included-type";
}
```

## Examples

See the [examples/](./examples/) directory:

- `basic-usage.ts` - Simple schema filtering example
- `nested-types.ts` - Nested type structures with filtering
- `disable-auto-expose.ts` - Using @disableAutoExpose directive
- `polymorphic-types.ts` - Interface and Union type handling

Run examples:

```bash
bun example basic
bun example nested
bun example disable-auto-expose
bun example polymorphic
```

## Development

```bash
# Install dependencies
bun install

# Run examples
bun run example:basic
```

## License

MIT

## Credits

This library implements the type reachability closure algorithm for GraphQL schema filtering with target-based access control.
