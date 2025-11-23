# graphql-schema-extract

GraphQL schema filtering library with `@expose` directive support for role-based access control.

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

### 1. Define @expose directive in your schema

```graphql
directive @expose(tags: [String!]!) repeatable on OBJECT | FIELD_DEFINITION

type Query {
  users: [User!]! @expose(tags: ["readonly", "admin"])
}

type User @expose(tags: ["readonly", "admin"]) {
  id: ID!
  name: String!
  salary: Float @expose(tags: ["admin"])
}
```

### 2. Filter schema for a specific role

```typescript
import { filterSchemaForRole } from "graphql-schema-extract";
import { buildSchema } from "graphql";

const schema = buildSchema(/* your schema */);

const filteredSchema = await filterSchemaForRole(schema, {
  role: "readonly",
  autoInferEntryPoints: true,
});
```

## How It Works

The library implements a type reachability closure algorithm:

1. **Parse @expose directives** from your GraphQL schema
2. **Infer entry points** - Query/Mutation fields marked with `@expose` for the target role
3. **Compute reachability** - BFS traversal to find all types referenced from entry points
4. **Filter fields** - Remove fields not exposed to the target role
5. **Rebuild schema** - Create new GraphQL schema with filtered types

## @expose Directive Rules

### Type-level Application

When applied to a type, all fields are exposed by default to the specified tags:

```graphql
type Project @expose(tags: ["readonly", "admin"]) {
  id: ID! # Exposed to readonly, admin
  name: String! # Exposed to readonly, admin
}
```

### Field-level Override

Field-level `@expose` overrides type-level settings:

```graphql
type User @expose(tags: ["readonly", "admin"]) {
  id: ID!
  name: String!
  # Only admin can access
  salary: Float @expose(tags: ["admin"])
  # No @expose = not accessible to any role
  password: String!
}
```

### Default Behavior

Without `@expose`, types/fields are **not exposed** to any role.

## API Reference

### `filterSchemaForRole(schema, options)`

Main function to filter a GraphQL schema for a specific role.

**Parameters:**

- `schema`: GraphQLSchema - The schema to filter
- `options`: FilterSchemaOptions
  - `role`: string - Target role (e.g., "readonly", "admin")
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
- `api-integration.ts` - Integration with GraphQL API endpoint

Run examples:

```bash
bun run example:basic
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

This library implements the type reachability closure algorithm for GraphQL schema filtering with role-based access control.
