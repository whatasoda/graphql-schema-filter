# @graphql-schema-filter/core

GraphQL schema filtering library with `@expose` directive support for target-based access control.

## Features

- **Target-based filtering**: Filter GraphQL schemas based on `@expose` directives with tag-based access control
- **Smart defaults**: Auto-expose output type fields, permissive input type handling, explicit Query/Mutation field control
- **Type-safe**: Full TypeScript support with comprehensive type definitions
- **Flexible**: Configurable reachability analysis and field retention policies
- **Production-ready**: Built with rslib, dual format (ESM + CJS), with source maps and declaration files

## Installation

```bash
npm install @graphql-schema-filter/core graphql
# or
yarn add @graphql-schema-filter/core graphql
# or
pnpm add @graphql-schema-filter/core graphql
# or
bun add @graphql-schema-filter/core graphql
```

## Quick Start

```typescript
import { buildSchema } from "graphql";
import { filterSchemaForTarget } from "@graphql-schema-filter/core";

const schema = buildSchema(`
  directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

  type Query {
    users: [User!]! @expose(tags: ["readonly", "admin"])
    adminUsers: [User!]! @expose(tags: ["admin"])
  }

  type User {
    id: ID!
    name: String!
    email: String!
    salary: Float @expose(tags: ["admin"])
  }
`);

// Filter for readonly users
const readonlySchema = await filterSchemaForTarget(schema, {
  target: "readonly",
});

// Filter for admin users
const adminSchema = await filterSchemaForTarget(schema, {
  target: "admin",
});
```

## API

### `filterSchemaForTarget(schema, options)`

Main entry point for filtering GraphQL schemas.

**Parameters:**

- `schema: GraphQLSchema` - The GraphQL schema to filter
- `options: FilterSchemaOptions` - Filtering options
  - `target: string` - The target tag for filtering (e.g., "admin", "readonly")
  - `autoInferEntryPoints?: boolean` - Auto-infer entry points from `@expose` directives (default: true)
  - `entryPoints?: EntryPoint[]` - Manual entry point definitions
  - `reachability?: ReachabilityConfig` - Reachability analysis configuration
  - `fieldRetention?: FieldRetentionPolicy` - Field retention policy

**Returns:** `Promise<GraphQLSchema>` - Filtered schema

## Directives

### `@expose(tags: [String!]!)`

Mark fields as exposed to specific targets.

```graphql
directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
```

### `@disableAutoExpose`

Disable automatic field exposure for a type (treat like Query/Mutation).

```graphql
directive @disableAutoExpose on OBJECT | INTERFACE
```

## Advanced Usage

For detailed documentation, examples, and advanced configuration, please visit the [GitHub repository](https://github.com/whatasoda/graphql-schema-filter).

## License

MIT
