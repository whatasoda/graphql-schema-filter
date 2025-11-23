# Known Issues

## Bug: Interface Reference Duplication

**Status**: Open
**Severity**: Critical
**Discovered**: 2025-11-23 (Dog fooding test - polymorphic-types example)

### Description

When filtering types that implement interfaces, the schema construction fails with "Schema must contain uniquely named types" error due to both original and filtered interface instances being included in the schema.

### Root Cause

Same as "Type Reference Replacement Timing Issue" below - when filtering Object types that implement interfaces, the interface reference replacement happens before all interfaces are processed and added to `filteredTypeMap`.

In `filterObjectType()`:
```typescript
const filteredInterfaces = type.getInterfaces().map((iface) => {
  const filtered = this.filteredTypeMap.get(iface.name);
  return (filtered ?? iface) as GraphQLInterfaceType;  // Falls back to original!
});
```

If the Interface hasn't been processed yet, `filteredTypeMap.get()` returns `undefined`, and the original interface instance is used, causing duplication.

### Example

```graphql
type Article implements Node {
  id: ID!
  # ...
}

interface Node {
  id: ID!
  # ...
}
```

**Error**: "Schema must contain uniquely named types but contains multiple types named 'Node'"

### Proposed Solution

Use the same two-pass approach as described in "Type Reference Replacement Timing Issue" below.

### Test Case

Run `bun example polymorphic` to reproduce.

---

## Bug: Type Reference Replacement Timing Issue

**Status**: Open
**Severity**: High
**Discovered**: 2025-11-23 (Dog fooding test - nested-types example)

### Description

When filtering nested types, field filtering works correctly, but the filtered type is not used in type references due to a timing issue in the two-pass schema construction.

### Root Cause

In `SchemaFilter.buildFilteredTypeMap()`:
1. Types are processed in iteration order
2. When filtering a type (e.g., `Organization`), it calls `replaceTypeReferences()` for field types
3. If a referenced type (e.g., `BillingInfo`) hasn't been processed yet, `filteredTypeMap.get()` returns `undefined`
4. The fallback uses the original (unfiltered) type: `return (filteredType ?? type) as GraphQLType`

### Example

```graphql
type Organization {
  billing: BillingInfo @expose(tags: ["admin"])
}

type BillingInfo {
  plan: String!
  internalNotes: String @expose(tags: [])  # Should be excluded
}
```

**Expected behavior (admin role)**:
```graphql
type BillingInfo {
  plan: String!
  # internalNotes is excluded
}
```

**Actual behavior**:
```graphql
type BillingInfo {
  plan: String!
  internalNotes: String  # Bug: NOT excluded!
}
```

### Debug Output

```
[DEBUG] BillingInfo.internalNotes: shouldInclude=false, role=admin
[DEBUG] Filtered BillingInfo fields: [ "plan", "creditCard" ]
[DEBUG] replaceTypeReferences(BillingInfo): filteredType exists=false
```

This shows:
1. ✅ Field filtering works correctly
2. ✅ `filteredTypeMap` contains the correctly filtered type
3. ❌ `replaceTypeReferences()` doesn't find the filtered type (timing issue)
4. ❌ Original unfiltered type is used instead

### Proposed Solution

Modify `buildFilteredTypeMap()` to use a true two-pass approach:

**Pass 1**: Filter all types and add to `filteredTypeMap` (with unresolved type references)
```typescript
// First pass: Create all filtered types without resolving references
for (const [typeName, type] of Object.entries(typeMap)) {
  // ... existing filtering logic ...
  // BUT: Don't call replaceTypeReferences() yet
}
```

**Pass 2**: Resolve type references
```typescript
// Second pass: Update type references in all filtered types
for (const [typeName, filteredType] of this.filteredTypeMap.entries()) {
  // Update field types to use filtered type references
  // This ensures all types are in filteredTypeMap before resolution
}
```

### Workaround

None currently. Avoid using `@expose(tags: [])` for explicit exclusion in nested types until this is fixed.

### Test Case

Run `DEBUG_FIELD_FILTERING=1 bun example nested` and observe that `BillingInfo.internalNotes` appears in the admin schema despite being excluded by field filtering logic.
