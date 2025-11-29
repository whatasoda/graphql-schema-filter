# @graphql-schema-filter/core

GraphQL schema filtering library with `@expose` directive support for target-based access control.

## Features

- **Target-based filtering**: Filter GraphQL schemas based on `@expose` directives with tag-based access control
- **Smart defaults**: Auto-expose output type fields, permissive input type handling, explicit Query/Mutation field control
- **Type-safe**: Full TypeScript support with comprehensive type definitions
- **Zero config**: Simple API with sensible defaults
- **Production-ready**: Dual format (ESM + CJS) with source maps and declaration files

## Installation

```bash
npm install @graphql-schema-filter/core graphql
```

## Quick Start

```typescript
import { buildSchema } from "graphql";
import { filterSchema } from "@graphql-schema-filter/core";

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
const readonlySchema = filterSchema(schema, {
  target: "readonly",
});

// Filter for admin users
const adminSchema = filterSchema(schema, {
  target: "admin",
});
```

## API

### `filterSchema(schema, options)`

Main entry point for filtering GraphQL schemas.

**Parameters:**

- `schema: GraphQLSchema` - The GraphQL schema to filter
- `options: FilterSchemaOptions`
  - `target: string` - The target tag for filtering (e.g., "admin", "readonly")

**Returns:** `GraphQLSchema` - Filtered schema

### Exported Types

```typescript
import type {
  FilterSchemaOptions,
  SchemaAnalysis,
  TypeLevelExposureInfo,
  FieldLevelExposureInfo,
} from "@graphql-schema-filter/core";
```

### Directive Definitions

The package includes a `directives.graphql` file at `dist/directives.graphql`. You can symlink this file to your project or copy the definitions to your schema as needed:

```bash
ln -s node_modules/@graphql-schema-filter/core/dist/directives.graphql src/graphql/directives.graphql
```

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

## Documentation

For detailed documentation, examples, and advanced usage, please visit the [GitHub repository](https://github.com/whatasoda/graphql-schema-filter).

## License

MIT
