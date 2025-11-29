# @graphql-schema-filter/schema-first-approach

GraphQL schema filtering for schema-first projects. This package provides utilities to load `.graphql` files from disk and apply target-based filtering using `@expose` directives.

## Features

- **File-based schema loading**: Collect `.graphql`/`.gql` files using glob patterns
- **Automatic directive handling**: Strips unknown directives while preserving `@expose` and `@disableAutoExpose`
- **Integration with core**: Uses `@graphql-schema-filter/core` for filtering logic
- **Efficient file loading**: Concurrent file reading with RxJS

## Installation

```bash
npm install @graphql-schema-filter/schema-first-approach graphql
```

## Quick Start

```typescript
import { createSchemaFilter } from "@graphql-schema-filter/schema-first-approach";

// Create a schema filter from file patterns
const schemaFilter = createSchemaFilter({
  patterns: ["src/graphql/**/*.graphql"],
});

// Get filtered schema for a specific target
const filteredSchema = await schemaFilter.getFilteredSchema({
  target: "readonly",
});
```

## API

### `createSchemaFilter(options)`

Creates a schema filter instance that can load and filter GraphQL schemas from files.

**Parameters:**

- `options: SchemaFilterOptions`
  - `patterns: string[]` - Glob patterns to match schema files (e.g., `["src/**/*.graphql"]`)
  - `globOptions?: FastGlobOptions` - Options passed to fast-glob

**Returns:** `SchemaFilter`

### `SchemaFilter`

#### `getSourceAst()`

Returns the parsed AST of all collected schema documents.

```typescript
const result = await schemaFilter.getSourceAst();
if (result.type === "parsed") {
  console.log(result.parsed); // DocumentNode
  console.log(result.raw); // Raw schema string
}
```

#### `getFilteredSchema(options)`

Filters the schema for a specific target.

```typescript
const filteredSchema = await schemaFilter.getFilteredSchema({
  target: "admin",
  logLevel: "info", // optional: "debug" | "info" | "warn" | "none"
});
```

### Exported Types

```typescript
import type { SchemaFilterOptions } from "@graphql-schema-filter/schema-first-approach";
```

## Directives

This package works with the directives defined in `@graphql-schema-filter/core`:

### `@expose(tags: [String!]!)`

Mark fields as exposed to specific targets.

```graphql
directive @expose(
  tags: [String!]!
) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
```

### `@disableAutoExpose`

Disable automatic field exposure for a type.

```graphql
directive @disableAutoExpose on OBJECT | INTERFACE
```

## Documentation

For detailed documentation about the `@expose` directive and filtering behavior, please refer to the [@graphql-schema-filter/core](https://www.npmjs.com/package/@graphql-schema-filter/core) package or the [GitHub repository](https://github.com/whatasoda/graphql-schema-filter).

## License

MIT
