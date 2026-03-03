# Plan: Connection Package Cleanup & Simplification

## Context

The `connection/` package has accumulated dead code, unused utilities, and over-engineered abstractions. Only 2 files in `app/` consume this package (`query-executor.ts` and `schema-prefetch.ts`), using a very narrow slice of its public API. This cleanup removes unused code, simplifies abstractions, and tightens the package's surface area.

---

## Phase 1: Remove Dead Code (~120 lines)

### 1a. Delete `connection/utils.ts` (root-level)
- `NotImplementedError` is never imported anywhere in the codebase.
- **File**: `connection/utils.ts` — delete entirely.

### 1b. Remove unused PostgreSQL utilities from `connection/src/postgresql/utils.ts`
These functions are **never called** by any production code (only defined, not consumed):
- `parseConnectionString()` (lines 135-154)
- `buildSimpleSelectQuery()` (lines 163-175)
- `getTablesQuery()` (lines 181-188)
- `getTableColumnsQuery()` (lines 195-205)
- `getTableIndexesQuery()` (lines 213-221)
- `escapeIdentifier()` (lines 88-90) — only used by `buildSimpleSelectQuery` which is itself unused
- `toPgLiteral()` (lines 97-128)
- `PG_TYPES` constant (lines 226-245)

**Keep** only: `extractTableSchemaFromFields`, `isTimeoutError`, `isAuthenticationError`, `errorHasMessage` re-export.

### 1c. Remove `valueIsArray()` from `connection/src/neo4j/utils.ts`
- It's literally `Array.isArray(value)`. Replace its 2 call sites with `Array.isArray()` directly.

### 1d. Remove unused methods from `PostgresRecordParser`
- `parse()` method (lines 168-195) — only called in tests, never by production code
- `parseWithMetadata()` method (lines 141-159) — only called in tests, never by production code
- The production path uses `bulkParse()` inherited from the abstract parent. These two methods are redundant wrappers.
- Update tests to use `bulkParse()` instead, or remove those test cases if they only test dead code paths.

---

## Phase 2: Simplify Abstractions

### 2a. Remove `isGraphObject` / `parseGraphObject` stubs from PostgresRecordParser
- `isGraphObject()` always returns `false`, `parseGraphObject()` is a passthrough.
- They exist only to satisfy the `NeodashRecordParser` abstract class contract.
- Make these methods optional in the abstract class (provide default no-op implementations in `NeodashRecordParser`) so PostgreSQL doesn't need to override them with stubs.

### 2b. Remove unused `executionTime` computation in PostgresConnectionModule
- `connection/src/postgresql/PostgresConnectionModule.ts` lines 114+122: `startTime` and `executionTime` are computed but never used.
- Delete both lines.

---

## Phase 3: Trim Public API Exports

### 3a. Clean up `connection/src/index.ts`
Remove exports that are never consumed outside the package:
- `DEFAULT_AUTHENTICATION_CONFIG` — only used internally by auth modules
- `AuthType` — only used internally by auth modules
- `ConnectionModule` — abstract class, never imported by consumers
- `Neo4jConnectionModule` / `PostgresConnectionModule` — consumers use the factory, not direct constructors
- `QueryStatus` — never imported by app (used via callback pattern internally)
- `getConnectionTypeName` / `getSupportedConnectionTypes` — never consumed by app

**Keep** only what `app/` actually imports:
- `createConnectionModule` (used by `query-executor.ts`)
- `DEFAULT_CONNECTION_CONFIG` (used by `query-executor.ts`)
- `ConnectionTypes` (used by `query-executor.ts`)
- `Neo4jSchemaManager` (used by `schema-prefetch.ts`)
- `PostgresSchemaManager` (used by `schema-prefetch.ts`)
- Schema types: `DatabaseSchema`, `TableDef`, `ColumnDef`, `PropertyDef`, `AuthConfig` (used as type imports)

### 3b. Clean up `connection/src/postgresql/index.ts` barrel
- Currently re-exports everything including unused utils via `export * from './utils'`.
- Only re-export what's needed internally.

---

## Phase 4: Minor Type Safety Fixes

### 4a. Move `neo4j-driver-core` from devDependencies to dependencies
- `connection/src/generalized/interfaces.ts` imports `{ READ, WRITE }` from `neo4j-driver-core/lib/driver.js` at runtime.
- Currently listed only in `devDependencies` — should be in `dependencies`.

---

## Phase 5: Update Tests

- Remove test cases for deleted methods (`parse()`, `parseWithMetadata()` in postgres-parser tests).
- Update `neo4j/utils` tests if they test `valueIsArray` directly.
- Update factory tests if they test `getConnectionTypeName`/`getSupportedConnectionTypes`.
- Run full test suite: `cd connection && npm test`

---

## Files Modified

| File | Action |
|------|--------|
| `connection/utils.ts` | DELETE |
| `connection/src/postgresql/utils.ts` | Remove ~100 lines of unused functions |
| `connection/src/neo4j/utils.ts` | Remove `valueIsArray`, inline `Array.isArray` |
| `connection/src/postgresql/PostgresRecordParser.ts` | Remove `parse()` and `parseWithMetadata()` |
| `connection/src/postgresql/PostgresConnectionModule.ts` | Remove unused `executionTime` |
| `connection/src/generalized/NeodashRecordParser.ts` | Add default no-op for `isGraphObject`/`parseGraphObject` |
| `connection/src/postgresql/PostgresRecordParser.ts` | Remove now-unnecessary stub overrides |
| `connection/src/index.ts` | Trim to only consumed exports |
| `connection/src/postgresql/index.ts` | Stop re-exporting unused utils |
| `connection/src/adapters/index.ts` | Remove unused factory re-exports |
| `connection/package.json` | Move `neo4j-driver-core` to dependencies |
| `connection/__tests__/postgresql/postgres-parser.ts` | Remove tests for deleted methods |
| `connection/__tests__/postgresql/postgres-utils.ts` | Remove tests for deleted utils |
| `connection/__tests__/adapters/factory.ts` | Remove tests for deleted functions |

---

## Verification

1. `cd connection && npm test` — all remaining tests pass
2. `npm run build` — no type errors from trimmed exports
3. `npm run lint` — no lint errors
4. `cd app && npm test` — app tests still pass (consumer uses only kept exports)
5. `npm run test:e2e` — end-to-end tests still pass (optional, heavy)
