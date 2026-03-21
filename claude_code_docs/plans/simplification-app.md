# App Package — Code Quality & Simplification Analysis

**Date:** 2026-03-20
**Package:** `app/` (~577+ source files)
**Verdict:** Most issues here. Security gaps in API routes, god components, low test coverage (44%).

---

## Architecture Boundary Violations

**PASS** — No direct boundary violations. App correctly orchestrates `connection/` and `component/`.

---

## Findings

### CRITICAL — Missing Tenant Filtering on API Routes (4 locations)

Multi-tenancy rules require `tenant_id` on every query. Several routes skip this.

| File | Line | Issue |
|------|------|-------|
| `api/connections/route.ts` | 11-42 | Admin path has NO tenant filter — can list connections from ALL tenants |
| `api/query/route.ts` | 40-70 | Fast path, fallback path, and solution path all lookup connections without tenant filter |
| `api/dashboards/[id]/share/route.ts` | 71 | Share lookup uses only `dashboardId`, no tenant filter |
| `api/dashboards/[id]/export/route.ts` | 17-21 | Checks tenant on dashboard but **no access control** — any user in tenant can export any dashboard |

**Fix for connections route:**
```typescript
const whereClause = and(
  eq(connections.tenantId, tenantId),
  isAdmin ? undefined : eq(connections.userId, userId)
);
```

**Fix for all routes:** Audit every `db.select()` / `db.update()` / `db.delete()` for `tenantId` in WHERE clause.

---

### HIGH — Missing Access Control on Export Endpoint

**File:** `api/dashboards/[id]/export/route.ts` (lines 17-25)

Any authenticated user can export any dashboard in their tenant by guessing the UUID. No ownership or sharing check.

**Fix:** Use the same `canAccess()` helper from the dashboard `[id]` route before allowing export.

---

### HIGH — God Components (2 pages)

#### Dashboard Editor — 577 lines
**File:** `app/(dashboard)/[id]/edit/page.tsx`

- 15+ pieces of local state
- 8+ inline Zustand store action calls
- Template sync, parameter persistence, unsaved changes, page management, dialog control — all in one file
- Deeply nested JSX (lines 449-558)

**Extract:**
- `TemplateSync` component (lines 162-190)
- `PageManagementSection` (lines 449-458)
- `WidgetGridRenderer` (lines 504-559)

#### Dashboard Viewer — 359 lines
**File:** `app/(dashboard)/[id]/page.tsx`

- Complex auto-refresh countdown logic (lines 98-152)
- Promise queue for serializing saves (line 119) with silently swallowed errors
- Multiple complex `useCallback` hooks

**Extract:** `useAutoRefreshLogic` custom hook.

---

### HIGH — In-Memory Pagination for Large Datasets

**File:** `api/dashboards/route.ts` (lines 51-82, 86-123)

Admin path fetches ALL dashboards into memory, then slices:
```typescript
const all = await db.select({ ... }).from(dashboards).where(...);
// ... mapping ...
const paginated = mapped.slice(offset, offset + limit);
```

For 10,000+ dashboards, this loads everything before discarding most rows.

**Fix:** Use database-level `LIMIT` and `OFFSET`:
```typescript
const all = await db.select({ ... }).from(dashboards)
  .where(eq(dashboards.tenantId, tenantId))
  .limit(limit).offset(offset);
```

---

### HIGH — Missing Tests for Critical Utilities

Zero test coverage on:
- `lib/query-executor.ts` — core query execution logic
- `lib/crypto.ts` — encryption/decryption (security-critical)
- `lib/format-parameter-value.ts` — parameter formatting
- `lib/collect-parameter-names.ts` — parameter extraction

Overall app/ coverage is ~44%, well below the 80% target.

---

### MEDIUM — API Response Inconsistencies

| File | Issue |
|------|-------|
| `api/dashboards/[id]/export/route.ts` | Returns raw `new Response(JSON.stringify(...))` instead of `apiSuccess()` envelope |
| `api/keys/route.ts` (line 36-41) | Throws generic `Error("Forbidden")` instead of using `forbidden()` helper |

All routes should use the same `apiSuccess()` / `apiError()` pattern.

---

### MEDIUM — Dashboard Store Inefficiency

**File:** `stores/dashboard-store.ts` (lines 91-95)

```typescript
hasUnsavedChanges: () => {
  return JSON.stringify(layout) !== JSON.stringify(savedLayout);
}
```

`JSON.stringify` comparison on every render (called by `useUnsavedChangesWarning` hook). O(n) cost grows with dashboard size.

**Fix:** Track a dirty flag on mutations, or use deep equality with memoization.

---

### MEDIUM — localStorage Without Error Handling

**File:** `stores/parameter-store.ts` (lines 96-114)

```typescript
localStorage.setItem(key, JSON.stringify(parameters));
```

No try/catch for quota exceeded (Safari Private Mode throws). `restoreFromDashboard` has catch but silently swallows.

---

### MEDIUM — Race Condition in useUnsavedChangesWarning

**File:** `hooks/use-unsaved-changes-warning.ts` (lines 70-78)

```typescript
navigatingRef.current = true;
if (pendingUrl.current) {
  window.location.href = url; // Race between ref and navigation
}
```

Another `beforeunload` could fire between the ref assignment and `location.href` assignment.

---

### MEDIUM — Silently Swallowed Auto-Save Errors

**File:** `app/(dashboard)/[id]/page.tsx` (lines 119-137)

```typescript
persistQueueRef.current = persistQueueRef.current
  .catch(() => undefined)
  .then(() => updateDashboard.mutateAsync(payload))
  .catch(() => undefined);
```

Both `.catch()` handlers swallow errors silently. User gets no feedback if dashboard auto-save fails.

---

### MEDIUM — Missing Suspense Boundaries

**File:** `app/(dashboard)/[id]/page.tsx` (lines 177-189)

Loading state shows skeleton but no `<Suspense>` boundary. Entire dashboard blocks on data before rendering.

---

### MEDIUM — Hooks Missing Pagination

| Hook | File | Issue |
|------|------|-------|
| `useConnections` | `hooks/use-connections.ts` (25-32) | Fetches all connections, no limit |
| `useDashboards` | `hooks/use-dashboards.ts` (49-57) | Fetches all dashboards, no limit |

Could load thousands of records for large deployments.

---

### MEDIUM — Security: API Key Timing Attack

**File:** `lib/auth/api-key.ts` (line 53)

```typescript
const keyHash = hashApiKey(token);
const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
```

Database lookup timing can leak whether a hash prefix exists. Should use constant-time comparison after retrieval.

---

### MEDIUM — Security: HMAC Secret Fallback

**File:** `lib/auth/api-key.ts` (lines 13-16)

```typescript
const secret = process.env.API_KEY_HMAC_SECRET ?? process.env.ENCRYPTION_KEY;
```

Falls back to `ENCRYPTION_KEY` if dedicated secret not set. Key rotation would invalidate all API key hashes. Should require a dedicated secret.

---

### LOW — TypeScript Type Assertions

| File | Lines | Issue |
|------|-------|-------|
| `connections/page.tsx` | 148, 150 | `value={formState[field] as string}` — `sslRejectUnauthorized` is boolean |
| `widget-editor-modal.tsx` | 99-111 | `widget?.settings?.title as string` — no validation |
| `lib/query-executor.ts` | 84-89 | `as { runQuery: ... }` with `unknown` params |
| `date-utils.test.ts` | 142 | `"unknown" as any` — should comment why |

---

### LOW — Dashboard Grid Infinity Workaround

**File:** `app/(dashboard)/[id]/edit/page.tsx` (lines 246-268)

```typescript
const hasInfinity = page.gridLayout.some((g) => !Number.isFinite(g.y));
```

Workaround for react-grid-layout async compaction bug. Patches `Infinity` values in the save handler instead of fixing at the source. No test for this edge case.

---

### LOW — Duplicate try/catch Boilerplate

Every API route wraps handler logic in:
```typescript
try { /* handler */ } catch (error) { return handleRouteError(error, "message"); }
```

Could be extracted into a `withRouteHandler(fn)` wrapper to reduce boilerplate.

---

## Priority Fix Order

1. **IMMEDIATE:** Add tenant filtering to all connection/dashboard/share queries (security)
2. **IMMEDIATE:** Add access control check to export endpoint (security)
3. **HIGH:** Split editor/viewer god components into smaller pieces (maintainability)
4. **HIGH:** Use database-level pagination for dashboard list (performance)
5. **HIGH:** Add tests for crypto, query-executor, parameter utils (reliability)
6. **MEDIUM:** Standardize API response format across all routes
7. **MEDIUM:** Fix silently swallowed auto-save errors — show user feedback
8. **MEDIUM:** Replace JSON.stringify comparison in dashboard store
9. **MEDIUM:** Add error handling for localStorage operations
10. **MEDIUM:** Require dedicated HMAC secret, remove fallback
11. **LOW:** Fix type assertions to use proper validation
12. **LOW:** Extract try/catch boilerplate into route handler wrapper
