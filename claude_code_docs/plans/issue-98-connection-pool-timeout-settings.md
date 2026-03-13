# Plan: Issue #98 — Expose Connection Pool & Timeout Settings in Connector UI

## Summary

Surface existing hardcoded connection pool and timeout settings as user-configurable options in the connector creation/edit form. Both Neo4j and PostgreSQL drivers already support these parameters but they are buried in code. This feature adds an optional "Advanced" collapsible section in the connection dialog where users can tune pool size, timeouts, and SSL options.

**Issue:** https://github.com/alfredo1996/neoboard/issues/98
**Milestone:** v0.7 — API & Developer Experience
**Branch:** `feat/issue-98-connection-pool-timeout`

---

## Architecture Decision

**Approach:** Thread-through with backward-compatible optional fields.

The advanced settings will be:
1. **Defined** as optional fields on the existing `ConnectionCredentials` type (app) and propagated to `AuthConfig` → driver constructors (connection).
2. **Validated** via Zod schema extension with `.optional()` + sensible `.default()` values.
3. **Stored** inside the existing `configEncrypted` JSON blob — no new DB columns, no migration.
4. **Rendered** via a new collapsible "Advanced Settings" section in the connections page dialog (app-owned UI, not the component-package `ConnectionForm`).

Why NOT a DB migration: The encrypted config JSON is already a flexible bag. Adding optional keys to it is fully backward-compatible — existing connections without these keys get defaults at the driver layer.

---

## Affected Packages

| Package | Impact | Files |
|---------|--------|-------|
| `connection/` | **Medium** — Accept new optional config fields in `AuthenticationModule.createDriver()` for both Neo4j and PostgreSQL | `Neo4jAuthenticationModule.ts`, `PostgresAuthenticationModule.ts`, `interfaces.ts`, `factory.ts` |
| `app/` | **Medium** — Extend Zod schemas, thread advanced settings through query-executor, add UI section in connections page | `schemas.ts`, `query-executor.ts`, `connections/page.tsx` |
| `component/` | **None** — The connections page builds its own form inline (does not use `ConnectionForm` from component package). The existing Accordion component from `component/ui` will be reused. |

---

## Ordered Tasks

### Task 1: Extend `connection/` interfaces and types (S)

**Files:**
- `connection/src/generalized/interfaces.ts` — Add `AdvancedConnectionOptions` interface
- `connection/src/index.ts` — Export new type

```typescript
/** Optional advanced settings passed from the app layer to driver constructors. */
export interface AdvancedConnectionOptions {
  // Neo4j-specific
  neo4jConnectionTimeout?: number;      // ms, default 30000
  neo4jQueryTimeout?: number;            // ms, default 2000
  neo4jMaxPoolSize?: number;             // default: driver default
  neo4jAcquisitionTimeout?: number;      // ms

  // PostgreSQL-specific
  pgConnectionTimeoutMillis?: number;    // default 10000 (current hardcoded)
  pgIdleTimeoutMillis?: number;          // default 10000
  pgMaxPoolSize?: number;                // default 10
  pgStatementTimeout?: number;           // ms, default 30000
  pgSslRejectUnauthorized?: boolean;     // when sslMode=require
}
```

**Test:** Unit test in `connection/src/generalized/__tests__/` validating defaults are applied when options are undefined.

---

### Task 2: Thread options into Neo4j driver creation (S)

**Files:**
- `connection/src/neo4j/Neo4jAuthenticationModule.ts` — Accept `AdvancedConnectionOptions` in constructor, pass to `neo4j.driver()` config

Currently `createDriver()` creates the driver with no config object:
```typescript
return neo4j.driver(this._authConfig.uri, auth);
```

Change to:
```typescript
return neo4j.driver(this._authConfig.uri, auth, {
  connectionTimeout: this._advancedOptions?.neo4jConnectionTimeout ?? 30000,
  maxConnectionPoolSize: this._advancedOptions?.neo4jMaxPoolSize,
  connectionAcquisitionTimeout: this._advancedOptions?.neo4jAcquisitionTimeout,
});
```

Also thread `neo4jQueryTimeout` to override `DEFAULT_CONNECTION_CONFIG.timeout` when provided.

**Test:** Unit test verifying driver is created with custom config when options are provided.

---

### Task 3: Thread options into PostgreSQL pool creation (S)

**Files:**
- `connection/src/postgresql/PostgresAuthenticationModule.ts` — Accept `AdvancedConnectionOptions` in constructor, pass to `new Pool()`

Currently `createDriver()` hardcodes `connectionTimeoutMillis: 10000`. Change to thread all PG options:
```typescript
const pool = new Pool({
  user: ...,
  host: ...,
  port: ...,
  database: ...,
  connectionTimeoutMillis: this._advancedOptions?.pgConnectionTimeoutMillis ?? 10000,
  idleTimeoutMillis: this._advancedOptions?.pgIdleTimeoutMillis ?? 10000,
  max: this._advancedOptions?.pgMaxPoolSize ?? 10,
  ssl: this._advancedOptions?.pgSslRejectUnauthorized !== undefined
    ? { rejectUnauthorized: this._advancedOptions.pgSslRejectUnauthorized }
    : undefined,
});
```

Also apply `pgStatementTimeout` override in `PostgresConnectionModule._runSqlQuery()` (currently uses `config.timeout` which comes from `DEFAULT_CONNECTION_CONFIG`).

**Test:** Unit test verifying Pool is created with custom pool options.

---

### Task 4: Update factory to pass advanced options (S)

**Files:**
- `connection/src/adapters/factory.ts` — Extend `createConnectionModule()` signature to accept optional `AdvancedConnectionOptions`
- `connection/src/generalized/AuthenticationModule.ts` — Add optional `advancedOptions` to abstract class

The factory function gains a third parameter:
```typescript
export function createConnectionModule(
  type: ConnectionTypes,
  authConfig: AuthConfig,
  advancedOptions?: AdvancedConnectionOptions
): ConnectionModule
```

**Test:** Factory test verifying options are forwarded to created modules.

---

### Task 5: Extend app Zod schemas (S)

**Files:**
- `app/src/lib/schemas.ts`

Add advanced fields as optional to `connectionConfigSchema`:
```typescript
export const connectionConfigSchema = z.object({
  uri: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  database: z.string().optional(),
  // Advanced pool/timeout settings (optional, sensible defaults)
  connectionTimeout: z.number().int().min(0).optional(),
  queryTimeout: z.number().int().min(0).optional(),
  maxPoolSize: z.number().int().min(1).max(100).optional(),
  connectionAcquisitionTimeout: z.number().int().min(0).optional(),
  idleTimeout: z.number().int().min(0).optional(),
  statementTimeout: z.number().int().min(0).optional(),
  sslRejectUnauthorized: z.boolean().optional(),
});
```

**Test:** Extend existing schema tests to verify advanced fields pass and fail validation correctly. Ensure existing payloads without advanced fields still pass.

---

### Task 6: Thread advanced options through query-executor (M)

**Files:**
- `app/src/lib/query-executor.ts`

Update `ConnectionCredentials` interface to include optional advanced fields. In `getOrCreateModule()`, extract advanced options and pass to factory:
```typescript
const advancedOptions = {
  neo4jConnectionTimeout: credentials.connectionTimeout,
  neo4jQueryTimeout: credentials.queryTimeout,
  neo4jMaxPoolSize: credentials.maxPoolSize,
  neo4jAcquisitionTimeout: credentials.connectionAcquisitionTimeout,
  pgConnectionTimeoutMillis: credentials.connectionTimeout,
  pgIdleTimeoutMillis: credentials.idleTimeout,
  pgMaxPoolSize: credentials.maxPoolSize,
  pgStatementTimeout: credentials.statementTimeout ?? credentials.queryTimeout,
  pgSslRejectUnauthorized: credentials.sslRejectUnauthorized,
};
```

Also update the cache key to include advanced settings (hash or serialized).

In `executeQuery()`, override `config.timeout` and `config.connectionTimeout` if advanced settings provide them:
```typescript
const config = {
  ...connectionInterfaces.DEFAULT_CONNECTION_CONFIG,
  connectionType: toConnectionType(type),
  database: credentials.database,
  ...(options?.accessMode ? { accessMode: options.accessMode } : {}),
  ...(credentials.queryTimeout ? { timeout: credentials.queryTimeout } : {}),
  ...(credentials.connectionTimeout ? { connectionTimeout: credentials.connectionTimeout } : {}),
};
```

**Test:** Extend existing query-executor tests to verify advanced options are threaded.

---

### Task 7: Add Advanced Settings UI in connections page (M)

**Files:**
- `app/src/app/(dashboard)/connections/page.tsx`

Add to `DEFAULT_FORM`:
```typescript
const DEFAULT_FORM = {
  name: "",
  type: "neo4j" as "neo4j" | "postgresql",
  uri: "",
  username: "",
  password: "",
  database: "",
  // Advanced
  connectionTimeout: "",
  queryTimeout: "",
  maxPoolSize: "",
  connectionAcquisitionTimeout: "",
  idleTimeout: "",
  statementTimeout: "",
  sslRejectUnauthorized: false,
};
```

Below the Database field, add a collapsible "Advanced Settings" section using the `Accordion` component from `@neoboard/components`. Conditionally show Neo4j-specific or PostgreSQL-specific fields based on `form.type`.

**Neo4j advanced fields:**
- Connection Timeout (ms) — placeholder: 30000
- Query Timeout (ms) — placeholder: 2000
- Max Pool Size — placeholder: "driver default"
- Connection Acquisition Timeout (ms) — placeholder: "driver default"

**PostgreSQL advanced fields:**
- Connection Timeout (ms) — placeholder: 10000
- Idle Timeout (ms) — placeholder: 10000
- Max Pool Size — placeholder: 10
- Statement Timeout (ms) — placeholder: 30000
- Reject Unauthorized SSL — Switch (only shown when sslmode = require)

Thread values into `handleCreate()` and `handleTestInline()` config payloads. Parse numeric strings to numbers before sending (empty string = omit field).

**Test:** E2E test (Playwright) — open create dialog, expand "Advanced Settings", fill a timeout field, create connection. Verify round-trip works.

---

### Task 8: Thread advanced settings in test-inline and test routes (S)

**Files:**
- `app/src/app/api/connections/test-inline/route.ts`
- `app/src/app/api/connections/[id]/test/route.ts`

The test-inline route already receives the full config. Since `connectionConfigSchema` now includes optional advanced fields, they flow through automatically. The `testConnection()` call in `query-executor.ts` will pick them up.

For the `[id]/test` route, advanced settings are already stored in `configEncrypted` and decrypted into `ConnectionCredentials`, so no change needed beyond the type extension.

**Test:** Extend existing test-inline test to include an advanced field in the payload.

---

## Migration Needed?

**No.** The advanced settings are stored inside the existing `configEncrypted` JSON blob. No new database columns are required. This is the safest approach:
- Existing connections without advanced fields continue working with hardcoded defaults.
- New/edited connections with advanced fields get them encrypted and persisted automatically.

---

## Security Checklist

- [x] **No new secrets** — Advanced settings are non-sensitive numeric values (timeouts, pool sizes). They ride inside the existing AES-256-GCM encrypted config blob.
- [x] **Validation** — Zod schemas enforce `z.number().int().min(0)` / `.max(100)` bounds. No arbitrary values.
- [x] **No SQL/Cypher injection** — Settings are numeric and passed as driver constructor config, never interpolated into queries.
- [x] **SSL toggle safety** — `sslRejectUnauthorized: false` is an intentional user choice for self-signed certs. The UI should show a warning tooltip when this is toggled off.
- [x] **No logging of decrypted config** — Existing pattern preserved. Advanced settings never logged.
- [x] **Backward compatibility** — Old connections without advanced fields use sensible defaults.
- [x] **Max pool size bounded** — Capped at 100 to prevent resource exhaustion.

---

## Testing Strategy

| Layer | What | Tool |
|-------|------|------|
| **connection/** unit | `AdvancedConnectionOptions` defaults, driver creation with options | Vitest |
| **connection/** integration | Neo4j driver with custom timeout, PG pool with custom pool size | Vitest + Docker |
| **app/** unit — schemas | Zod validation: valid advanced fields, invalid values, missing fields | Vitest |
| **app/** unit — query-executor | Advanced options threaded to factory, cache key changes with options | Vitest |
| **app/** unit — API routes | test-inline with advanced fields, create with advanced fields | Vitest (mocked DB) |
| **E2E** | Create connection with advanced settings expanded + filled, verify persistence | Playwright |

**Coverage impact:** Positive. New code with tests. Existing tests unaffected (backward-compatible defaults).

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Neo4j driver options API changes between versions | Low | Pin neo4j-driver version, validate options at driver creation |
| User sets timeout too low, all queries fail | Medium | UI shows recommended ranges + tooltip warnings. Validation enforces `min(0)`. |
| Pool size too high exhausts DB connections | Medium | Max capped at 100. Tooltip warns about DB-side limits. |
| `sslRejectUnauthorized: false` used carelessly | Medium | Show warning badge next to the toggle. Only visible when sslmode = require. |
| Cache key mismatch if advanced settings change | Low | Include serialized advanced options in cache key hash |
| Breaking change in `createConnectionModule` signature | Low | Third param is optional, all existing callers are in `query-executor.ts` (single call site) |

---

## Suggested GitHub Issues

This can be implemented as a single PR since the scope is contained. If splitting is preferred:

1. **`feat(connection): accept advanced connection options in driver constructors`** (Tasks 1-4)
   - Labels: `enhancement`, `pkg:connection`, `area:connectors`
   - Size: S

2. **`feat(app): expose pool/timeout settings in connector UI`** (Tasks 5-8)
   - Labels: `enhancement`, `pkg:app`, `area:connectors`
   - Size: M
   - Depends on #1

Both would target `dev` and belong to milestone v0.7.

---

## Implementation Order

```
Task 1 (interfaces) ──> Task 2 (Neo4j driver) ──> Task 4 (factory)
                    ──> Task 3 (PG driver)    ──/
                                                  ──> Task 5 (Zod schemas)
                                                  ──> Task 6 (query-executor)
                                                  ──> Task 7 (UI)
                                                  ──> Task 8 (API routes)
```

Tasks 2 and 3 can be parallelized. Tasks 5-8 depend on 4 being complete.
