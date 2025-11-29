# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GraphQL schema filtering library with `@expose` directive support for target-based access control. The library transforms GraphQL schemas by filtering types and fields based on target-specific visibility rules defined through `@expose` directives.

**NOTE:** This library is not yet published to npm. Breaking changes are allowed without a major version bump.

## Development Environment

**Package Manager:** Bun with workspaces

**Runtime:** Node.js

**Build Tool:** rslib (Rsbuild-based library bundler)

**Test Runner:** Bun

**Language:** TypeScript with ESNext target

**Workspace Structure:** Monorepo with `packages/*` and `examples/*`

## Common Commands

```bash
# Install dependencies (workspace root)
bun install

# Build core package
bun run build

# Run basic example
bun example basic

# Type check all packages
bun run typecheck
```

## Core Architecture

The library implements a **6-phase filtering pipeline**:

### 1. Parse Phase (Schema Analysis)

**Location:** `packages/core/src/analysis/schema-analysis.ts`

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

**Location:** `packages/core/src/reachability/reachability.ts`

Computes type reachability closure using **BFS traversal** from entry points:

- Entry points: Query/Mutation fields exposed via `@expose` for the target, plus their return types
- Traversal follows: return types, argument types, interface implementations, union members, input object fields
- Configurable via `ReachabilityConfig`:
  - `includeInterfaceImplementations`: Include interface's possible types (default: true)
  - `includeReferenced`: Control reference traversal - 'all' (default), 'args-only', or 'none'

**Algorithm:**

1. Seeds work queue with entry points
2. Pops type from queue, marks as reachable
3. Based on type kind (Object/Interface/Union/InputObject), adds referenced types to queue
4. Continues until queue is empty

### 3. AST Conversion Phase

Converts the GraphQL schema to SDL string and parses it into an AST document for manipulation.

### 4. AST Filtering Phase

**Location:** `packages/core/src/filter/ast-filter.ts`

Filters AST definitions based on reachability and exposure rules:

- Removes type definitions that are not reachable
- Filters fields based on `@expose` directive rules
- Preserves type wrappers (NonNull, List) correctly

### 5. Schema Building Phase

Builds a new GraphQL schema from the filtered AST definitions using `buildASTSchema`.

### Main Entry Point (`filterSchema`)

**Location:** `packages/core/src/filter-schema.ts`

Orchestrates the 6-phase pipeline:

1. Parse `@expose` directives via schema analysis
2. Infer entry points from `@expose` directives
3. Compute reachable types via BFS traversal
4. Convert schema to AST
5. Filter AST definitions
6. Build new schema from filtered AST

## Key Design Patterns

**AST-based filtering:** The library converts schema to AST, filters definitions, then rebuilds. This approach avoids circular reference issues inherent in direct schema manipulation.

**Lazy parsing:** Schema analysis is performed once per `filterSchema` call, parsing all directives upfront into maps for O(1) lookup during filtering.

**Closure computation:** The reachability algorithm implements mathematical closure - starting from entry points, it finds all types transitively reachable through the type graph until no new types are discovered.

## Code Organization

```
packages/
└── core/                       # Main package (@graphql-schema-filter/core)
    ├── src/
    │   ├── index.ts                    # Public API exports
    │   ├── types.ts                    # Shared TypeScript interfaces
    │   ├── filter-schema.ts            # Main entry point & orchestration
    │   ├── analysis/
    │   │   ├── schema-analysis.ts      # Schema analysis & directive parsing
    │   │   ├── directive.ts            # Directive parsing utilities
    │   │   └── exposure-info.ts        # Exposure info data structures
    │   ├── reachability/
    │   │   ├── reachability.ts         # Type reachability computation
    │   │   └── traverse.ts             # Type graph traversal
    │   ├── filter/
    │   │   └── ast-filter.ts           # AST-level filtering
    │   └── utils/
    │       └── logger.ts               # Logging utilities
    ├── __tests__/                      # Test files
    │   └── integration/                # Integration tests
    ├── dist/                   # Built files (ESM + CJS + DTS)
    ├── package.json            # Package metadata & exports
    ├── rslib.config.ts         # Build configuration
    └── tsconfig.*.json         # TypeScript configurations

scripts/
└── example.ts                  # Example runner script

tsconfig.json                   # Root project references (tsc -b)
tsconfig.base.json              # Shared TypeScript compiler options
```

## Important Implementation Notes

**Type wrapping:** When filtering fields, preserve GraphQL type wrappers (NonNull, List). The AST filtering preserves wrapper structure correctly.

**AST node access:** `@expose` directives are extracted from `astNode.directives` on GraphQL type/field objects. The schema must be built from source (e.g., via `buildSchema`) to preserve AST nodes.

**Introspection types:** Types starting with `__` are skipped during parsing and reachability analysis but are automatically included by GraphQL schema construction.

**Console output:** The main filtering function logs progress (entry points, reachable type count) to console for debugging. This is intentional for library users to understand what's happening.
