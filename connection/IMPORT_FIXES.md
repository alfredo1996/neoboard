# Import Fixes - FieldMetadata to FieldDef

## Issue

The import `import { FieldMetadata } from 'pg';` was incorrect. The `pg` package (and its TypeScript types `@types/pg`) exports `FieldDef`, not `FieldMetadata`.

## Root Cause

The PostgreSQL client library uses `FieldDef` as the type for field metadata in query results:

```typescript
export interface FieldDef {
  name: string;
  tableID: number;
  columnID: number;
  dataTypeID: number;
  dataTypeSize: number;
  dataTypeModifier: number;
  format: string;
}
```

## Files Fixed

### Source Files

1. **`src/postgresql/PostgresRecordParser.ts`**
   - Changed: `import { FieldMetadata } from 'pg';`
   - To: `import type { FieldDef } from 'pg';`
   - Updated all type references in method signatures

2. **`src/postgresql/utils.ts`**
   - Changed: `import { FieldMetadata } from 'pg';`
   - To: `import type { FieldDef } from 'pg';`
   - Updated function parameter types

### Test Files

3. **`__tests__/postgresql/postgres-parser.ts`**
   - Changed: `import { FieldMetadata } from 'pg';`
   - To: `import type { FieldDef } from 'pg';`
   - Updated all type assertions: `as unknown as FieldMetadata` → `as unknown as FieldDef`

4. **`__tests__/postgresql/postgres-utils.ts`**
   - Changed: `import { FieldMetadata } from 'pg';`
   - To: `import type { FieldDef } from 'pg';`
   - Updated all type assertions: `as unknown as FieldMetadata[]` → `as unknown as FieldDef[]`

## Benefits of Using `type` Import

Changed from:
```typescript
import { FieldDef } from 'pg';
```

To:
```typescript
import type { FieldDef } from 'pg';
```

**Benefits:**
- ✅ Makes it clear this is a type-only import
- ✅ Better for tree-shaking (TypeScript removes it during compilation)
- ✅ Prevents accidental runtime usage
- ✅ Aligns with TypeScript best practices

## Verification

All tests pass after the fix:

```bash
npm test -- postgres

Test Suites: 3 passed, 3 total
Tests:       42 passed, 42 total
```

## WebStorm / IDE Configuration

If your IDE still shows errors:

1. **Restart TypeScript service**: In WebStorm, go to `File > Invalidate Caches / Restart`
2. **Check node_modules**: Ensure `@types/pg` is installed: `npm install --save-dev @types/pg`
3. **Update dependencies**: Run `npm install` to ensure all dependencies are up to date
4. **TypeScript version**: Ensure you're using TypeScript 4.5+ which has better type support

## Related Types

Other useful types from `pg`:

```typescript
import type {
  FieldDef,        // Field metadata
  QueryResult,     // Query result structure
  QueryResultRow,  // Row type
  Pool,            // Connection pool
  PoolClient,      // Pool client
  Client,          // Database client
} from 'pg';
```

## Migration Guide

If you have similar code elsewhere:

```typescript
// ❌ Old (incorrect)
import { FieldMetadata } from 'pg';

function process(fields: FieldMetadata[]) {
  // ...
}

// ✅ New (correct)
import type { FieldDef } from 'pg';

function process(fields: FieldDef[]) {
  // ...
}
```
