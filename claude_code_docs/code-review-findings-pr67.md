# Code Review Findings — PR #67 Parameter Selectors

> Generated 2026-02-25 during post-implementation code review.
> Applied improvements are marked ✅. Pending items require decision or design work.

---

## Applied (Code Improvements)

### ✅ `wrapWithPreviewLimit` double-LIMIT bug (app/)

**File:** `app/src/components/widget-editor-modal.tsx` (lines 70-82)

**Problem:** For Cypher/Neo4j, appending `LIMIT 25` to a query that already ends with `LIMIT N`
produced invalid Cypher (`MATCH ... RETURN n LIMIT 5 LIMIT 25`) and caused a Neo4j syntax error
in the widget preview. PostgreSQL was unaffected (uses subquery wrapper).

**Fix applied:** Added LIMIT detection regex before appending:
```typescript
if (/\bLIMIT\s+\d+\s*$/i.test(trimmed)) return trimmed;
```
New unit tests added to `widget-editor-modal.test.tsx`.

---

### ✅ `validatePieData` error message inaccuracy (app/)

**File:** `app/src/lib/chart-registry.ts` (line 402)

**Problem:** The condition `cols < 2` (which allows 2+ columns) displayed the message "requires
**exactly** 2 columns". This was misleading — having 3 columns is fine.

**Fix applied:** Changed message to "requires **at least** 2 columns".

---

### ✅ Duplicate dashboard in-flight guard (app/)

**File:** `app/src/app/(dashboard)/page.tsx` (line 202)

**Problem:** The Duplicate DropdownMenuItem had no guard against rapid clicks while a duplication
was already in progress, potentially firing multiple mutations.

**Fix applied:** Added `disabled={duplicateDashboard.isPending}` to the DropdownMenuItem.

---

## Pending Feature Improvements

These require design decisions or broader changes and should be planned as separate issues.

---

### 1. Multi-tenant isolation in seed query API calls

**File:** `app/src/components/parameter-widget-renderer.tsx`

**Problem (CodeRabbit — Critical):** The `useSeedQuery` hook calls `/api/query` without
explicitly scoping to the current tenant. While the API route enforces tenant isolation via
the session + connection ownership check, a defense-in-depth approach would pass `tenantId`
explicitly in the fetch body as a safeguard.

**Suggested approach:**
- Read `tenantId` from the Auth.js session in the client component
- Include it in the `/api/query` payload for explicit validation
- Add a server-side assertion in the route to reject mismatched tenantIds

**Priority:** High (security defense-in-depth)

---

### 2. Stale cascading selector values when parent changes

**File:** `app/src/components/parameter-widget-renderer.tsx`

**Problem (CodeRabbit — Major):** When the parent parameter value changes (e.g., user selects
"Europe" as region), the child cascading-select (e.g., city = "New York") is not automatically
cleared in the parameter store. The widget clears its internal display state but the store
retains the old value, causing the dependent query to run with a stale child parameter.

**Current behavior:** Child widget shows empty/reset UI but store has stale value.

**Expected behavior:** Changing parent should clear child from the store immediately so queries
don't receive a stale child parameter.

**Suggested approach:**
- In the cascading-select `useEffect` that detects parent value changes, also call
  `clearParameter(parameterName)` when the parent changes.
- Add a unit test to verify store cleanup on parent change.

**Priority:** Medium (affects data correctness for cascading selectors)

---

### 3. Date parsing timezone offset bug

**Files:**
- `component/src/components/composed/parameter-widgets/date-picker.tsx`
- `component/src/components/composed/parameter-widgets/date-range-picker.tsx`

**Problem (CodeRabbit — Major):** `new Date("YYYY-MM-DD")` parses date strings as **UTC midnight**
but then `format()` (from date-fns) renders in the **local timezone**. In US timezones (UTC-5 to
UTC-8), this produces an off-by-one-day display error (e.g., "2024-06-15" displays as "June 14").

**Suggested approach:**
```typescript
// Instead of: new Date("2024-06-15")  ← UTC midnight → wrong local day
// Use:
const [y, m, d] = "2024-06-15".split("-").map(Number);
new Date(y, m - 1, d);  // Local midnight → correct day
```
Or use `parseISO` from date-fns which handles this correctly.

**Priority:** Medium (user-visible correctness, especially for US users)

---

### 4. Relative date presets don't refresh on dashboard reload

**File:** `app/src/components/parameter-widget-renderer.tsx`

**Problem (CodeRabbit — Major):** "Last 7 days" computes `_from`/`_to` at the moment the user
selects the preset. If the user keeps the dashboard open or reloads, those fixed dates become
stale. "Last 7 days" selected on Monday still uses Monday's dates on Friday.

**Suggested approach:**
- Store the preset key in the parameter store (e.g., `last_7_days`), not the resolved dates
- When resolving parameters for query execution, call `resolveRelativePreset` at query time
- This way, every query execution uses "today" as the reference date

**Priority:** Medium (affects all users of relative date parameters)

---

### 5. Seed query result uses ordinal column positions, not named columns

**File:** `app/src/components/parameter-widget-renderer.tsx`

**Problem (CodeRabbit — Major):** The `useSeedQuery` hook builds `ParamSelectorOption` using
`Object.values(record)[0]` (first column as value) and `Object.values(record)[1]` (second as label).
This breaks if the query author writes columns in a different order or uses aliased names.

**Suggested approach:**
- Support named column conventions: columns named `value` and `label` take precedence
- Fall back to first-column/second-column only when those names are absent
- Document the convention in the UI (hint text in the seed query textarea)

**Priority:** Low-Medium (affects developer ergonomics and query flexibility)

---

### 6. Abort signal missing on seed query fetch

**File:** `app/src/components/parameter-widget-renderer.tsx`

**Problem (CodeRabbit — Minor):** The `useSeedQuery` `queryFn` makes a `fetch()` call without
passing `signal: queryContext.signal`. This means React Query cannot abort in-flight requests
when the component unmounts or the query key changes (e.g., when the user rapidly changes a
parent cascade parameter).

**Suggested approach:**
```typescript
queryFn: async ({ signal }) => {
  const res = await fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, query, params: extraParams ?? {} }),
    signal,  // ← add this
  });
  ...
}
```

**Priority:** Low (performance improvement, avoids network waste)

---

### 7. App-layer test coverage gap

**Current state:** `app/` package has ~44% statement coverage (target: >70%).

**Key untested areas:**
- `src/app/api/users/route.ts` — 0% (CRUD user management API)
- `src/app/api/users/[id]/route.ts` — 0%
- `src/hooks/use-connections.ts`, `use-dashboards.ts`, `use-users.ts` — 0% (React Query hooks)
- `src/components/parameter-widget-renderer.tsx` — 0% component-level (logic tested via store)
- `src/lib/query-executor.ts` — 0%
- `src/lib/crypto.ts` — 0%

**Suggested approach:**
- Prioritize API route tests (pure function, easy to mock Drizzle)
- Add RTL (React Testing Library) tests for ParameterWidgetRenderer mounting with different parameterType props
- Hook tests require msw (Mock Service Worker) for fetch mocking

**Priority:** Medium (SonarQube quality gate)

---

## Summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| — | `wrapWithPreviewLimit` double-LIMIT bug | Bug (e2e) | ✅ Fixed |
| — | `validatePieData` misleading message | Cosmetic | ✅ Fixed |
| — | Duplicate button in-flight guard | UX | ✅ Fixed |
| 1 | Multi-tenant isolation in seed query | Security | Pending |
| 2 | Stale cascading child parameter | Logic | Pending |
| 3 | Date parsing timezone bug | Correctness | Pending |
| 4 | Relative date presets stale on reload | UX | Pending |
| 5 | Seed query ordinal column positions | DX | Pending |
| 6 | Missing abort signal on seed fetch | Performance | Pending |
| 7 | App-layer test coverage gap | Quality | Pending |
