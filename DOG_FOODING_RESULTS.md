# Dog Fooding Test Results

**Date**: 2025-11-23
**Purpose**: Validate implementation with practical use cases and identify issues

## Test Cases Executed

### 1. ✅ Basic Usage (`bun example basic`)

**Status**: PASS

**Tests**:
- Output type default public behavior
- Query root explicit `@expose` requirement
- InputObject permissive mode
- `@expose(tags: [])` for explicit exclusion

**Results**:
- ✅ Output type fields without `@expose` are auto-exposed
- ✅ Query fields require explicit `@expose`
- ✅ `@expose(tags: [])` correctly excludes fields
- ✅ InputObject fields without `@expose` are included by default

---

### 2. ⚠️ Nested Types (`bun example nested`)

**Status**: PARTIAL PASS with known bug

**Tests**:
- Nested type structures and relations
- Reachability computation
- Self-referential types
- Field filtering in nested types

**Results**:
- ✅ Nested structures work correctly
- ✅ Self-referential types (User.manager: User) work without infinite loops
- ✅ Reachability analysis correctly identifies all referenced types
- ❌ **BUG**: Field filtering works, but filtered types are not used in type references

**Discovered Issues**:
- **Bug**: Type Reference Replacement Timing Issue (see ISSUES.md)
  - **Severity**: High
  - **Impact**: Fields marked with `@expose(tags: [])` in nested types are not excluded
  - **Cause**: Type references are replaced before all types are filtered and added to `filteredTypeMap`

---

### 3. ❌ Polymorphic Types (`bun example polymorphic`)

**Status**: FAIL - Critical Bug

**Tests**:
- Interface field filtering
- Interface implementors
- Union types

**Results**:
- ❌ **CRITICAL BUG**: Schema construction fails with duplicate type error
- Error: "Schema must contain uniquely named types but contains multiple types named 'Node'"

**Discovered Issues**:
- **Bug**: Interface Reference Duplication (see ISSUES.md)
  - **Severity**: Critical
  - **Impact**: Cannot use Interface types at all
  - **Cause**: Both original and filtered Interface instances are included in schema
  - **Root Cause**: Same as Type Reference Replacement Timing Issue

**Workaround**: None - Interface/Union support is currently broken

---

### 4. ✅ @disableAutoExpose Directive (`bun example disable`)

**Status**: PASS

**Tests**:
- `@disableAutoExpose` directive behavior
- Nested Query structures
- Explicit field exclusion in marked types

**Results**:
- ✅ `@disableAutoExpose` correctly changes field exposure behavior
- ✅ Fields without `@expose` in marked types are excluded
- ✅ Nested Query structures (e.g., Query.user: UserQueries) work correctly
- ✅ Normal types still use default public behavior

---

## Summary of Findings

### Working Features ✅

1. **Output Type Default Public** - Fields without `@expose` are auto-exposed
2. **Query/Mutation Explicit Mode** - Root fields require `@expose`
3. **InputObject Permissive Mode** - Input fields included by default
4. **@disableAutoExpose Directive** - Works as designed
5. **Explicit Exclusion** - `@expose(tags: [])` works for non-nested types
6. **Self-Referential Types** - No infinite loops
7. **Reachability Analysis** - Correctly computes type closure
8. **Nested Query Structures** - Delegated resolvers pattern works

### Critical Issues ❌

1. **Interface/Union Support Broken** (CRITICAL)
   - Schema construction fails with duplicate type error
   - Affects any schema using interfaces or unions
   - See: ISSUES.md - "Interface Reference Duplication"

2. **Nested Type Field Filtering** (HIGH)
   - Filtered fields appear in nested types
   - `@expose(tags: [])` doesn't work for nested types
   - See: ISSUES.md - "Type Reference Replacement Timing Issue"

### Root Cause Analysis

Both critical issues stem from the same architectural problem:

**Current Architecture**: Single-pass type filtering
- Types are processed in iteration order
- Type references are replaced immediately during filtering
- If referenced type hasn't been processed yet, original type is used

**Required Fix**: Two-pass type filtering
- **Pass 1**: Filter all types without resolving references
- **Pass 2**: Resolve all type references using filtered types

### Impact Assessment

**Can Use**:
- ✅ Simple object types with field-level filtering
- ✅ Query/Mutation root field filtering
- ✅ InputObject filtering
- ✅ @disableAutoExpose for nested query patterns
- ✅ Self-referential types

**Cannot Use**:
- ❌ Interface types (CRITICAL - fails with error)
- ❌ Union types (CRITICAL - fails with error)
- ❌ `@expose(tags: [])` in nested types (fields still appear)

**Production Readiness**: ⚠️ **NOT READY**
- Critical bugs prevent use with Interface/Union
- Suitable only for simple schemas without polymorphic types

---

## Recommended Next Steps

### High Priority

1. **Fix Two-Pass Architecture** (Addresses both critical bugs)
   - Refactor `buildFilteredTypeMap()` to use two passes
   - Pass 1: Create all filtered types
   - Pass 2: Resolve type/interface references

### Medium Priority

2. **Add Integration Tests**
   - Automated tests for Interface/Union scenarios
   - Regression tests for type reference replacement

3. **Improve Error Messages**
   - Better errors when type reference resolution fails
   - Validation warnings for unsupported patterns

### Low Priority

4. **Performance Optimization**
   - Profile reachability analysis for large schemas
   - Consider caching filtered schemas

---

## Test Script

A new test runner was added: `bun example <type>`

Available examples:
- `bun example basic` - Basic functionality
- `bun example nested` - Nested types (has known bug)
- `bun example polymorphic` - Interface/Union (currently fails)
- `bun example disable` - @disableAutoExpose directive

Debug mode: `DEBUG_EXPOSE_PARSER=1` or `DEBUG_FIELD_FILTERING=1`

---

## Conclusion

The dog fooding exercise successfully identified **2 critical architectural issues** that prevent production use:

1. Interface/Union types cause schema construction failures
2. Nested type field filtering doesn't work correctly

Both issues have the same root cause (single-pass architecture) and require the same fix (two-pass refactoring).

Despite these issues, the core concepts work well:
- Default public for output types
- Explicit marking for Query/Mutation
- @disableAutoExpose for special cases

With the two-pass architecture fix, this library will be production-ready for complex schemas.
