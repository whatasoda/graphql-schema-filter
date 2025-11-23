# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GraphQL schema filtering library with `@expose` directive support for role-based access control. The library transforms GraphQL schemas by filtering types and fields based on role-specific visibility rules defined through `@expose` directives.

**NOTE:** This library is not yet published to npm. Breaking changes are allowed without a major version bump.

## Development Environment

**Package Manager:** Bun

**Runtime:** Node.js

**Test Runner:** Bun

**Language:** TypeScript with ESNext target

## Common Commands

```bash
# Install dependencies
bun install

# Run basic example
bun run example:basic

# Run API integration example
bun run example:api
```

## Core Architecture

The library implements a **3-phase filtering pipeline**:

### 1. Parse Phase (`ExposeParser`)

**Location:** `src/parser/expose-parser.ts`

Extracts `@expose` and `@disableAutoExpose` directives from GraphQL schema AST and builds two data structures:

- `fieldExposeMap`: Field-level exposure rules for Object/Interface/InputObject fields (e.g., `salary: Float @expose(tags: ["admin"])`)
- `typeDisableAutoExposeSet`: Set of type names with `@disableAutoExpose` directive

**Key behavior:**

- **Output types (Object/Interface)**:
  - Fields without `@expose` are **included** by default (auto-exposed)
  - Use `@expose` to restrict fields to specific roles or exclude fields with `@expose(tags: [])`
- **Query/Mutation/Subscription root types**:
  - Fields without `@expose` are **excluded** by default
  - Must explicitly mark fields with `@expose` to make them accessible
- **Types with `@disableAutoExpose`**:
  - Treated like root types - fields without `@expose` are **excluded**
  - Useful for nested query structures or security-sensitive types
- **Input types (InputObject)**:
  - Fields without `@expose` are **included** by default (permissive mode)
  - Use `@expose` only to restrict specific fields

### 2. Reachability Analysis Phase (`ReachabilityAnalyzer`)

**Location:** `src/analyzer/reachability.ts`

Computes type reachability closure using **BFS traversal** from entry points:

- Entry points: Query/Mutation fields exposed via `@expose` for the target role, plus their return types
- Traversal follows: return types, argument types, interface implementations, union members, input object fields
- Configurable via `ReachabilityConfig`:
  - `includeInterfaceImplementations`: Include interface's possible types (default: true)
  - `includeReferenced`: Control reference traversal - 'all' (default), 'args-only', or 'none'

**Algorithm:**

1. Seeds work queue with entry points
2. Pops type from queue, marks as reachable
3. Based on type kind (Object/Interface/Union/InputObject), adds referenced types to queue
4. Continues until queue is empty

### 3. Schema Filtering Phase (`SchemaFilter`)

**Location:** `src/filter/schema-filter.ts`

Rebuilds GraphQL schema with only reachable types and exposed fields using a **2-pass approach**:

**Pass 1:** Build filtered type map

- Filter types by reachability
- For Object/Interface types, filter fields based on `fieldRetention` policy:
  - `'exposed-only'`: Only include fields exposed to the role (default)
  - `'all-for-included-type'`: Include all fields if type is reachable
- For InputObject types, use permissive mode:
  - Fields with `@expose` are checked against the role
  - Fields without `@expose` are included by default

**Pass 2:** Build root types (Query/Mutation/Subscription)

- Construct root types using filtered type references from Pass 1
- Ensures type references are properly resolved

### Main Entry Point (`filterSchemaForRole`)

**Location:** `src/filter/filter-schema.ts`

Orchestrates the 3-phase pipeline:

1. Instantiate `ExposeParser` to extract directives
2. Infer entry points from `@expose` directives (if `autoInferEntryPoints: true`)
3. Use `ReachabilityAnalyzer` to compute reachable types
4. Use `SchemaFilter` to rebuild schema with filtered types/fields

## Key Design Patterns

**Two-pass schema construction:** The `SchemaFilter` uses a two-pass approach to avoid circular reference issues when rebuilding the schema. All non-root types are filtered first, then root types reference the filtered types.

**Lazy parsing:** `ExposeParser` is instantiated once per `filterSchemaForRole` call and parses all directives upfront into maps for O(1) lookup during filtering.

**Closure computation:** The reachability algorithm implements mathematical closure - starting from entry points, it finds all types transitively reachable through the type graph until no new types are discovered.

## Code Organization

```
src/
├── index.ts                    # Public API exports
├── types.ts                    # Shared TypeScript interfaces
├── parser/
│   └── expose-parser.ts        # @expose directive parsing
├── analyzer/
│   └── reachability.ts         # Type reachability BFS algorithm
├── filter/
│   ├── filter-schema.ts        # Main entry point & orchestration
│   └── schema-filter.ts        # Schema rebuilding with filtering
└── utils/
    └── type-utils.ts           # GraphQL type manipulation helpers
```

## Important Implementation Notes

**Type wrapping:** When filtering fields, preserve GraphQL type wrappers (NonNull, List). The `resolveTypeReference` method in `SchemaFilter` handles unwrapping and re-wrapping types correctly.

**AST node access:** `@expose` directives are extracted from `astNode.directives` on GraphQL type/field objects. The schema must be built from source (e.g., via `buildSchema`) to preserve AST nodes.

**Introspection types:** Types starting with `__` are skipped during parsing and reachability analysis but are automatically included by GraphQL schema construction.

**Console output:** The main filtering function logs progress (entry points, reachable type count) to console for debugging. This is intentional for library users to understand what's happening.
