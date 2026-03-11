# Task 2.1 — Per-Widget Refresh Button + Manual Run Mode

**Date:** 2026-03-10
**Parent:** issue-93-plan.md (Phase 2)
**Branch:** `feat/issue-93-widget-ux-polish`
**Base:** `dev`

---

## Summary

Add two new boolean chart behavior options — `showRefreshButton` and `manualRun` — available to all chart types except `parameter-select` and `form`. The refresh button renders in the widget card header and invalidates the TanStack Query cache for that widget. Manual-run mode starts the widget with the query disabled, shows a "Run Query" overlay, and resets to that overlay state whenever parameter values change.

---

## Current State Analysis

After reading the working tree, **most of the implementation is already in place** on the current branch. The following has already been done:

### Already implemented (in working tree, uncommitted/staged):

1. **`chart-options-schema.ts`** — `behaviorOptions` array (`showRefreshButton`, `manualRun`) already exists, already merged into all chart types except `parameter-select` and `form`.

2. **`chart-options-schema.test.ts`** — Tests for behavior options already written and presumably passing:
   - `showRefreshButton` and `manualRun` present on bar, line, pie, single-value, graph, map, table, json.
   - NOT present on parameter-select or form.
   - Category is "Behavior", defaults are `false`.

3. **`widget-card.tsx`** — `onRefresh` prop already implemented. Renders `RefreshCcw` icon button in header when provided. Positioned before `headerExtra`.

4. **`widget-card.test.tsx`** — Tests for `onRefresh` already written:
   - Renders refresh button when `onRefresh` provided.
   - Does not render when not provided.
   - Calls callback on click.
   - Renders alongside `headerExtra`.

5. **`dashboard-container.tsx`** — Refresh wiring already implemented:
   - Reads `chartOpts.showRefreshButton` per widget.
   - Passes `onRefresh` callback that calls `queryClient.invalidateQueries` with the correct query key `["widget-query", widget.connectionId, widget.query]`.
   - `RefreshCw` icon imported from lucide-react (though `widget-card.tsx` uses `RefreshCcw`).

6. **`card-container.tsx`** — Manual-run logic already implemented:
   - Reads `chartOptions.manualRun`.
   - `hasRun` state + `setHasRun`.
   - `useParameterValues()` for param change detection with `prevParamRef`.
   - `useEffect` resets `hasRun` to `false` on param change when `isManualRun`.
   - Passes `enabled: manualEnabled` to `useWidgetQuery`.
   - Renders manual-run overlay with `Play` icon + "Run Query" button + `data-testid="manual-run-overlay"`.

7. **`use-widget-query.ts`** — Already accepts `enabled?: boolean` option. When false, disables the query. Already documented as "Used by the manual-run feature."

8. **`parameter-store.ts`** — Already has `sourceWidgetId` on `ParameterEntry` (from Task 1.1).

### What has a known bug:

There is a **variable hoisting/ordering issue** in `card-container.tsx`. On line 117, `chartOptions.manualRun` is referenced:

```typescript
const isManualRun = chartOptions.manualRun === true;
```

But `chartOptions` is not defined until the `useMemo` on line 169:

```typescript
const chartOptions = useMemo(
  () => (widget.settings?.chartOptions ?? {}) as Record<string, unknown>,
  [widget.settings?.chartOptions],
);
```

This will cause a runtime error (`chartOptions is not defined`) because `const` declarations are not hoisted like `var`. The `useMemo` for `chartOptions` must be moved above the manual-run block.

---

## Implementation Plan

Given that most code is already written, the remaining work is **bug fixes, ordering corrections, and E2E test coverage**.

### Step 1: Fix variable ordering bug in `card-container.tsx`

**File:** `app/src/components/card-container.tsx`

**Problem:** `chartOptions` is used on line 117 but defined on line 169.

**Fix:** Move the `chartOptions` useMemo declaration to before the manual-run block. Specifically, move lines 169-172:

```typescript
const chartOptions = useMemo(
  () => (widget.settings?.chartOptions ?? {}) as Record<string, unknown>,
  [widget.settings?.chartOptions],
);
```

to immediately after the `isFormWidget` declaration (around line 111), before:

```typescript
const isManualRun = chartOptions.manualRun === true;
```

The `chartOptions` memo has no dependency on anything defined between lines 111-168, so this is safe. It only depends on `widget.settings?.chartOptions`.

**TDD approach:**
- **Red:** Run `cd component && npm test` and `cd app && npm test` to confirm current test status. The unit tests should pass because they test pure functions (not the React component render). The bug would manifest at runtime or in E2E.
- **Green:** Move the declaration.
- **Refactor:** Verify the order of all hooks/declarations makes logical sense.

### Step 2: Verify unit tests pass (component/ package)

**Command:** `cd component && npm test`

**Expected:** All tests in `chart-options-schema.test.ts` and `widget-card.test.tsx` should already pass since the implementation is complete. Confirm:

- `chart-options-schema.test.ts`:
  - `showRefreshButton` and `manualRun` present on 8 chart types.
  - Absent on `parameter-select` and `form`.
  - Category = "Behavior", defaults = `false`.

- `widget-card.test.tsx`:
  - Refresh button renders with `onRefresh` prop.
  - Does not render without it.
  - Click fires callback.
  - Renders alongside `headerExtra`.

### Step 3: Verify unit tests pass (app/ package)

**Command:** `cd app && npm test`

**Expected:** The `use-widget-query.test.ts` tests should pass. These test the pure functions (`extractReferencedParams`, `allReferencedParamsReady`, `getMissingParamNames`). The `enabled` option is tested implicitly through TanStack Query behavior at E2E level.

**Assessment:** No new unit tests are needed for `use-widget-query.ts` because:
- The `enabled` parameter is a pass-through to TanStack Query's `useQuery`. Testing that TanStack Query respects `enabled: false` is testing library internals.
- The manual-run state machine (hasRun flag, param reset) lives in `card-container.tsx`, which is a React component — per project rules, component rendering in `app/` is tested via Playwright E2E, not Vitest.

### Step 4: Run lint

**Command:** `cd app && npx next lint --fix`

Verify no lint errors from the reordered code.

### Step 5: E2E test — Refresh button

**File:** `app/e2e/widget-states.spec.ts` (extend existing)

**Test scenario: "widget with showRefreshButton shows refresh button in header"**

1. Log in as Alice, create a fresh dashboard.
2. Add a bar widget with a simple Cypher query (e.g., `MATCH (m:Movie) RETURN m.title AS title, m.released AS released LIMIT 5`).
3. In the widget editor, go to the "Settings" or chart options panel. Find "Behavior" category. Toggle "Show Refresh Button" on.
4. Save the widget.
5. In view mode (or after the widget renders on the grid), verify a refresh button (`role="button", name="Refresh"`) is visible in the widget card header.
6. Click it. Verify the widget re-renders (data is still visible; no error state).

**Key selectors:**
- Refresh button: `page.getByRole("button", { name: "Refresh" })` scoped to the widget card.
- Widget card: `page.locator("[data-testid='widget-card']")`.

### Step 6: E2E test — Manual run mode

**File:** `app/e2e/widget-states.spec.ts` (extend existing)

**Test scenario: "widget with manualRun shows Run Query overlay"**

1. Log in as Alice, create a fresh dashboard.
2. Add a table widget with a valid query.
3. In the widget editor, toggle "Manual Run" on in behavior options.
4. Save the widget.
5. Verify the widget shows the manual-run overlay: `page.locator("[data-testid='manual-run-overlay']")` is visible, containing text "Query execution is paused" and a "Run Query" button.
6. Click "Run Query."
7. Verify the overlay disappears and data is rendered (no loading skeleton persists, no error).

**Optional advanced scenario (parameter reset):**

8. Set up a parameter-select widget that targets a parameter used in the manual-run widget's query.
9. Change the parameter value.
10. Verify the manual-run widget resets back to the "Run Query" overlay.

(This advanced scenario may be brittle and could be deferred to a follow-up if time-constrained.)

### Step 7: Run full E2E suite

**Command:** `cd app && npx playwright test`

Confirm no regressions across all specs.

### Step 8: Build verification

**Command:** `npm run build`

Confirm the build passes with no type errors.

---

## Architecture Decision

**AD-4 from parent plan applies:** `showRefreshButton` and `manualRun` are chart options persisted in the existing `settings.chartOptions` JSON column. No schema migration needed. The behavior options are shared across all query-executing chart types via the `behaviorOptions` array in `chart-options-schema.ts`.

**Query invalidation strategy:** The refresh button uses `queryClient.invalidateQueries` with the key `["widget-query", widget.connectionId, widget.query]`. This matches the exact key structure used in `use-widget-query.ts` line 173-178. The invalidation will cause TanStack Query to refetch the data with the same params. This is correct.

**Manual-run state machine:**
```
                         ┌──────────────────┐
                         │   manualRun OFF   │ → normal query behavior
                         └──────────────────┘

                         ┌──────────────────┐
    widget mounts ──────>│  Overlay shown    │ (hasRun = false, enabled = false)
                         │  "Run Query" btn  │
                         └────────┬─────────┘
                                  │ user clicks "Run Query"
                                  ▼
                         ┌──────────────────┐
                         │  Query executes   │ (hasRun = true, enabled = true)
                         │  Data displayed   │
                         └────────┬─────────┘
                                  │ parameter values change
                                  ▼
                         ┌──────────────────┐
                         │  Overlay shown    │ (hasRun = false, reset)
                         │  "Run Query" btn  │
                         └──────────────────┘
```

**Potential issue with parameter change detection:** The current implementation uses `useParameterValues()` with `useShallow` and compares references (`prevParamRef.current !== allParamValuesForReset`). Since `useShallow` does shallow comparison, the reference will be stable when values don't change, and a new reference when they do. This is correct. However, `allParamValuesForReset` is defined but `allParamValues` is also defined later (line 175) for a different purpose — ensure no confusion between the two.

---

## Affected Files

| File | Package | Status | Remaining Work |
|------|---------|--------|---------------|
| `component/src/components/composed/chart-options-schema.ts` | component/ | DONE | None |
| `component/src/components/composed/__tests__/chart-options-schema.test.ts` | component/ | DONE | None |
| `component/src/components/composed/widget-card.tsx` | component/ | DONE | None |
| `component/src/components/composed/__tests__/widget-card.test.tsx` | component/ | DONE | None |
| `app/src/hooks/use-widget-query.ts` | app/ | DONE | None |
| `app/src/hooks/__tests__/use-widget-query.test.ts` | app/ | DONE | None (no new tests needed) |
| `app/src/components/card-container.tsx` | app/ | BUG | Fix `chartOptions` ordering (Step 1) |
| `app/src/components/dashboard-container.tsx` | app/ | DONE | None |
| `app/e2e/widget-states.spec.ts` | app/ | TODO | Add E2E tests (Steps 5-6) |

---

## Security Checklist

- [x] **No query modification:** Refresh uses TanStack `invalidateQueries` — re-executes the same query, no new user input paths.
- [x] **No credential exposure:** No new credential handling.
- [x] **Tenant isolation:** All query execution goes through existing `/api/query` route which enforces tenant filtering.
- [x] **No XSS:** Overlay text is static React content, no `dangerouslySetInnerHTML`.
- [x] **No param injection:** Manual-run does not alter query construction; it only gates execution timing.

---

## Testing Strategy

### Unit Tests (already done)

| Package | File | What | Status |
|---------|------|------|--------|
| component/ | `chart-options-schema.test.ts` | Behavior options on correct chart types, absent on excluded types, defaults | DONE |
| component/ | `widget-card.test.tsx` | Refresh button render, click callback, absence when not provided | DONE |
| app/ | `use-widget-query.test.ts` | Pure function tests (extractReferencedParams, etc.) | DONE (no new tests needed) |

### E2E Tests (to write)

| Spec | Scenario | Priority |
|------|----------|----------|
| `widget-states.spec.ts` | Refresh button visible when `showRefreshButton: true`, click re-fetches | HIGH |
| `widget-states.spec.ts` | Manual-run overlay visible when `manualRun: true`, click executes query | HIGH |
| `widget-states.spec.ts` | Manual-run resets on parameter change | MEDIUM (may defer) |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `chartOptions` variable ordering bug causes runtime crash | HIGH (confirmed) | Step 1 fixes this — move `useMemo` above usage |
| E2E tests for chart options toggle may be fragile (depends on UI layout of ChartSettingsPanel) | Medium | Use stable selectors: label text "Show Refresh Button", checkbox role. Fall back to creating widget via API seed if UI path is too complex. |
| `useParameterValues` reference comparison may miss changes when values are objects | Low | `useShallow` handles this correctly for primitive values. Object parameter values (date-range, number-range) have stable shapes. |
| Query key mismatch between `dashboard-container.tsx` invalidation and `use-widget-query.ts` | Low | Both use `["widget-query", connectionId, query]` — verified by code review. Note: `use-widget-query` also includes `params` in the key (4th element), but `invalidateQueries` with a partial key prefix matches all queries starting with those 3 elements. This is correct TanStack Query behavior. |

---

## Ordered Implementation Steps (Summary)

1. **Fix bug:** Move `chartOptions` useMemo above `isManualRun` in `card-container.tsx`
2. **Verify:** `cd component && npm test` (all pass)
3. **Verify:** `cd app && npm test` (all pass)
4. **Lint:** `cd app && npx next lint --fix`
5. **Write E2E:** Refresh button test in `widget-states.spec.ts`
6. **Write E2E:** Manual-run overlay test in `widget-states.spec.ts`
7. **Run E2E:** `cd app && npx playwright test`
8. **Build:** `npm run build`
