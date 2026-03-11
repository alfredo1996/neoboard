# Task 3.1 — "Run Once" Cache Forever Mode

**Date:** 2026-03-10
**Parent:** issue-93-plan.md (Phase 3)
**Branch:** `feat/issue-93-widget-ux-polish`
**Base:** `dev`
**Depends on:** Task 2.1 (refresh button + manual run) — already implemented on branch

---

## Summary

Add a new `cacheMode` chart option (`"ttl" | "forever"`) to the shared `behaviorOptions` group. When set to `"forever"`, the widget fetches data once and never re-fetches automatically — `staleTime: Infinity` and `gcTime: Infinity` are passed to TanStack Query. The refresh button is force-shown so the user always has a manual escape hatch. An info note appears in the widget editor when `"forever"` is selected.

---

## Current State Analysis

After reading the working tree on branch `feat/issue-93-widget-ux-polish`:

### Already implemented (from Task 2.1):
1. **`behaviorOptions`** array exists in `chart-options-schema.ts` (lines 212-230) with `showRefreshButton` and `manualRun`. Merged into all chart types except `parameter-select` and `form`.
2. **`dashboard-container.tsx`** reads `chartOpts.showRefreshButton` (line 203) and conditionally passes `onRefresh` to `WidgetCard` (lines 212-222).
3. **`card-container.tsx`** computes `staleTime` from `enableCache` / `cacheTtlMinutes` (lines 105-107) and passes it to `useWidgetQuery` (line 140).
4. **`use-widget-query.ts`** accepts `staleTime` in its options (line 207) and passes it to `useQuery`. It does **NOT** currently accept `gcTime`.
5. **`widget-editor-modal.tsx`** renders `ChartOptionsPanel` (lines 1025-1029) inside the `styleTab`. The "Advanced" tab has caching controls (lines 1104-1140).

### What needs to be built:
1. Add `cacheMode` select option to `behaviorOptions` in `chart-options-schema.ts`.
2. Add `gcTime` to `useWidgetQuery` options interface and pass it to `useQuery`.
3. In `card-container.tsx`, read `chartOptions.cacheMode` and when `"forever"`: override `staleTime` to `Infinity`, pass `gcTime: Infinity`.
4. In `dashboard-container.tsx`, force `showRefresh` to `true` when `cacheMode === "forever"` (regardless of `showRefreshButton` value).
5. In `widget-editor-modal.tsx`, show an info `<Alert>` when `cacheMode === "forever"` is selected.
6. Tests: unit tests for schema + pure logic, E2E for the full flow.

---

## Architecture Decision

**AD-5 from parent plan:** `cacheMode` is stored in `settings.chartOptions` JSON column alongside `showRefreshButton` and `manualRun`. No Drizzle migration needed. The `"forever"` mode overrides the existing `enableCache` / `cacheTtlMinutes` settings by producing `staleTime: Infinity` and adds `gcTime: Infinity` to prevent TanStack Query from garbage-collecting the cached result.

**Why force the refresh button:** When cache is infinite, the only way to get fresh data (short of a full page reload) is via the refresh button. Without it, the user would have no visible affordance to re-fetch. Forcing `showRefreshButton` to `true` is a UX safety measure.

**Where to enforce the `showRefresh` override:** In `dashboard-container.tsx` at the point where `showRefresh` is computed (line 203). This is the correct location because `dashboard-container.tsx` is the component that reads widget settings and passes `onRefresh` to `WidgetCard`.

---

## Affected Packages

| Package | Files Changed | Reason |
|---------|--------------|--------|
| `component/` | `chart-options-schema.ts`, `chart-options-schema.test.ts` | New `cacheMode` option in `behaviorOptions` |
| `app/` | `card-container.tsx`, `dashboard-container.tsx`, `use-widget-query.ts`, `widget-editor-modal.tsx` | Cache logic, refresh override, gcTime passthrough, info note |
| `app/` (tests) | `use-widget-query.test.ts` (optional), `widget-states.spec.ts` (E2E) | Test coverage |
| `connection/` | None | No changes |

---

## Ordered Implementation Steps

### Step 1: RED — Write failing unit test for `cacheMode` in chart-options-schema

**File:** `component/src/components/composed/__tests__/chart-options-schema.test.ts`

**Add tests:**

1. **`cacheMode` present on all behavior-supported chart types:**
   ```
   it("includes cacheMode for all chart types except parameter-select and form", () => {
     const types = ["bar", "line", "pie", "single-value", "graph", "map", "table", "json"];
     for (const type of types) {
       const keys = getChartOptions(type).map((o) => o.key);
       expect(keys).toContain("cacheMode");
     }
   });
   ```

2. **`cacheMode` absent on excluded types:**
   ```
   it("does NOT include cacheMode for parameter-select", () => {
     const keys = getChartOptions("parameter-select").map((o) => o.key);
     expect(keys).not.toContain("cacheMode");
   });

   it("does NOT include cacheMode for form", () => {
     const keys = getChartOptions("form").map((o) => o.key);
     expect(keys).not.toContain("cacheMode");
   });
   ```

3. **Default value:**
   ```
   it("defaults cacheMode to 'ttl'", () => {
     const defaults = getDefaultChartSettings("bar");
     expect(defaults.cacheMode).toBe("ttl");
   });
   ```

4. **Category and type:**
   ```
   it("cacheMode is a select option with category 'Behavior'", () => {
     const options = getChartOptions("bar");
     const cacheMode = options.find((o) => o.key === "cacheMode");
     expect(cacheMode?.type).toBe("select");
     expect(cacheMode?.category).toBe("Behavior");
     expect(cacheMode?.options).toHaveLength(2);
     expect(cacheMode?.options).toContainEqual({ label: "TTL (time-based)", value: "ttl" });
     expect(cacheMode?.options).toContainEqual({ label: "Forever (until refresh)", value: "forever" });
   });
   ```

**Run:** `cd component && npm test` — confirm these tests FAIL (Red).

---

### Step 2: GREEN — Add `cacheMode` to `behaviorOptions`

**File:** `component/src/components/composed/chart-options-schema.ts`

**Change:** Add a new `ChartOptionDef` entry to the `behaviorOptions` array (after `manualRun`):

```typescript
{
  key: "cacheMode",
  label: "Cache Mode",
  type: "select",
  default: "ttl",
  category: "Behavior",
  description:
    "TTL re-fetches data based on the cache timeout. Forever fetches once and caches until manually refreshed.",
  options: [
    { label: "TTL (time-based)", value: "ttl" },
    { label: "Forever (until refresh)", value: "forever" },
  ],
},
```

**Run:** `cd component && npm test` — confirm all tests PASS (Green).

**Refactor:** No refactoring needed; the change is additive.

---

### Step 3: RED — Write failing unit test for `gcTime` in `use-widget-query`

**File:** `app/src/hooks/__tests__/use-widget-query.test.ts`

**Assessment:** The `use-widget-query.test.ts` file only tests pure exported functions (`extractReferencedParams`, `allReferencedParamsReady`, `getMissingParamNames`). It does NOT test the `useWidgetQuery` hook itself (that would require a React render test, which is forbidden in `app/`).

The `gcTime` passthrough is a simple interface extension + one line in `useQuery` options. Testing that TanStack Query respects `gcTime` is testing library internals.

**Decision:** No new unit test in `use-widget-query.test.ts` for `gcTime`. The passthrough will be verified by:
- TypeScript compilation (type safety).
- E2E test (functional verification).

**Alternative (optional, recommended):** Extract a pure function `resolveCacheOptions(chartOptions, enableCache, cacheTtlMinutes)` from `card-container.tsx` that returns `{ staleTime, gcTime }`. This would be unit-testable in `app/`. See Step 4a.

---

### Step 3a: RED — Write failing unit test for `resolveCacheOptions` pure function

**File:** `app/src/lib/__tests__/resolve-cache-options.test.ts` (new file)

**Rationale:** Extract the cache resolution logic from `card-container.tsx` into a pure function so it can be unit tested without rendering React components. This follows the project's pattern of testing pure logic via Vitest.

**Tests to write:**

```typescript
import { describe, it, expect } from "vitest";
import { resolveCacheOptions } from "../resolve-cache-options";

describe("resolveCacheOptions", () => {
  it("returns TTL-based staleTime when cacheMode is 'ttl' and cache is enabled", () => {
    const result = resolveCacheOptions({ cacheMode: "ttl" }, true, 5);
    expect(result.staleTime).toBe(300_000); // 5 * 60_000
    expect(result.gcTime).toBeUndefined();
    expect(result.forceRefreshButton).toBe(false);
  });

  it("returns staleTime 0 when cacheMode is 'ttl' and cache is disabled", () => {
    const result = resolveCacheOptions({ cacheMode: "ttl" }, false, 5);
    expect(result.staleTime).toBe(0);
    expect(result.gcTime).toBeUndefined();
    expect(result.forceRefreshButton).toBe(false);
  });

  it("returns Infinity staleTime and gcTime when cacheMode is 'forever'", () => {
    const result = resolveCacheOptions({ cacheMode: "forever" }, true, 5);
    expect(result.staleTime).toBe(Infinity);
    expect(result.gcTime).toBe(Infinity);
    expect(result.forceRefreshButton).toBe(true);
  });

  it("returns Infinity even when enableCache is false for 'forever' mode", () => {
    const result = resolveCacheOptions({ cacheMode: "forever" }, false, 5);
    expect(result.staleTime).toBe(Infinity);
    expect(result.gcTime).toBe(Infinity);
    expect(result.forceRefreshButton).toBe(true);
  });

  it("defaults to 'ttl' when cacheMode is not set", () => {
    const result = resolveCacheOptions({}, true, 10);
    expect(result.staleTime).toBe(600_000); // 10 * 60_000
    expect(result.gcTime).toBeUndefined();
    expect(result.forceRefreshButton).toBe(false);
  });

  it("defaults to 'ttl' when chartOptions is empty", () => {
    const result = resolveCacheOptions({}, true, 5);
    expect(result.staleTime).toBe(300_000);
    expect(result.forceRefreshButton).toBe(false);
  });
});
```

**Run:** `cd app && npm test` — confirm these tests FAIL (file doesn't exist yet).

---

### Step 4: GREEN — Implement `resolveCacheOptions` pure function

**File:** `app/src/lib/resolve-cache-options.ts` (new file)

```typescript
/**
 * Pure function that determines TanStack Query cache options based on
 * the widget's chartOptions.cacheMode, enableCache, and cacheTtlMinutes.
 *
 * When cacheMode is "forever", staleTime and gcTime are both Infinity,
 * and forceRefreshButton is true (so the user always has a way to re-fetch).
 *
 * When cacheMode is "ttl" (default), the existing TTL-based caching applies.
 */
export function resolveCacheOptions(
  chartOptions: Record<string, unknown>,
  enableCache: boolean,
  cacheTtlMinutes: number,
): { staleTime: number; gcTime?: number; forceRefreshButton: boolean } {
  const cacheMode = chartOptions.cacheMode as string | undefined;

  if (cacheMode === "forever") {
    return {
      staleTime: Infinity,
      gcTime: Infinity,
      forceRefreshButton: true,
    };
  }

  // Default TTL mode
  return {
    staleTime: enableCache ? cacheTtlMinutes * 60_000 : 0,
    gcTime: undefined,
    forceRefreshButton: false,
  };
}
```

**Run:** `cd app && npm test` — confirm the `resolveCacheOptions` tests PASS (Green).

---

### Step 5: GREEN — Add `gcTime` to `useWidgetQuery` options

**File:** `app/src/hooks/use-widget-query.ts`

**Change 1:** Add `gcTime` to the options interface (around line 125):

```typescript
options?: {
  staleTime?: number;
  gcTime?: number;      // ← ADD THIS
  refetchInterval?: number | false;
  enabled?: boolean;
}
```

**Change 2:** Pass `gcTime` to `useQuery` (inside the `useQuery` call, around line 209):

```typescript
staleTime: options?.staleTime ?? 0,
gcTime: options?.gcTime,            // ← ADD THIS (undefined = TanStack default)
refetchInterval: options?.refetchInterval,
```

**Run:** `cd app && npm test` — confirm existing tests still pass.

---

### Step 6: REFACTOR — Update `card-container.tsx` to use `resolveCacheOptions`

**File:** `app/src/components/card-container.tsx`

**Change:** Replace the inline cache computation (lines 104-107):

```typescript
// BEFORE:
const enableCache = widget.settings?.enableCache !== false;
const cacheTtlMinutes = (widget.settings?.cacheTtlMinutes as number | undefined) ?? 5;
const staleTime = enableCache ? cacheTtlMinutes * 60_000 : 0;
```

with:

```typescript
// AFTER:
import { resolveCacheOptions } from "@/lib/resolve-cache-options";

const enableCache = widget.settings?.enableCache !== false;
const cacheTtlMinutes = (widget.settings?.cacheTtlMinutes as number | undefined) ?? 5;
const { staleTime, gcTime, forceRefreshButton } = resolveCacheOptions(
  chartOptions,
  enableCache,
  cacheTtlMinutes,
);
```

**Important ordering note:** The `chartOptions` `useMemo` must be declared BEFORE this line. It currently is (confirmed at line 113-116 in the working tree after the Task 2.1 reorder fix). Verify this.

**Change 2:** Pass `gcTime` to `useWidgetQuery` (line 140):

```typescript
// BEFORE:
const { missingParams, ...widgetQuery } = useWidgetQuery(queryInput, { staleTime, refetchInterval, enabled: manualEnabled });

// AFTER:
const { missingParams, ...widgetQuery } = useWidgetQuery(queryInput, { staleTime, gcTime, refetchInterval, enabled: manualEnabled });
```

**Export `forceRefreshButton`:** The `forceRefreshButton` flag needs to be consumed by `dashboard-container.tsx`, not `card-container.tsx` itself. However, `card-container.tsx` does not communicate back to its parent. Two approaches:

**Option A (recommended):** Move the `showRefresh` computation entirely to `dashboard-container.tsx`, where it already lives. `dashboard-container.tsx` already reads `chartOpts` from the widget (line 202). It can call `resolveCacheOptions` there too, or simply check `chartOpts.cacheMode === "forever"` inline. This keeps the logic co-located.

**Option B:** Have `card-container.tsx` expose a `forceRefreshButton` flag via a callback or context. This is unnecessarily complex.

**Go with Option A.** The `forceRefreshButton` from `resolveCacheOptions` is only needed in `card-container.tsx` as a self-check (unnecessary since `dashboard-container.tsx` controls the refresh button). In `card-container.tsx`, only `staleTime` and `gcTime` matter.

**Run:** `cd app && npm test` — confirm all tests pass.

---

### Step 7: Update `dashboard-container.tsx` — force refresh button for "forever" mode

**File:** `app/src/components/dashboard-container.tsx`

**Change:** Modify the `showRefresh` computation (line 203):

```typescript
// BEFORE:
const showRefresh = chartOpts.showRefreshButton === true;

// AFTER:
const showRefresh = chartOpts.showRefreshButton === true || chartOpts.cacheMode === "forever";
```

This is a one-line change. When `cacheMode === "forever"`, the refresh button appears regardless of whether `showRefreshButton` is explicitly enabled.

**Run:** `cd app && npx next lint --fix` — verify no lint issues.

---

### Step 8: Add info note in `widget-editor-modal.tsx`

**File:** `app/src/components/widget-editor-modal.tsx`

**Location:** The `ChartOptionsPanel` is rendered in the `styleTab` (line 1025-1029). The info note should appear **below the `ChartOptionsPanel`** in the same tab, so the user sees it immediately when they change the `cacheMode` dropdown.

**Change:** Wrap the `styleTab` content to include a conditional info alert:

```typescript
// BEFORE (lines 1024-1029):
styleTab={
  <ChartOptionsPanel
    chartType={chartType}
    settings={chartOptions}
    onSettingsChange={setChartOptions}
  />
}

// AFTER:
styleTab={
  <div className="space-y-4">
    <ChartOptionsPanel
      chartType={chartType}
      settings={chartOptions}
      onSettingsChange={setChartOptions}
    />
    {chartOptions.cacheMode === "forever" && (
      <Alert variant="default" className="py-2" data-testid="cache-forever-info">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Data will be fetched once and cached until manually refreshed.
        </AlertDescription>
      </Alert>
    )}
  </div>
}
```

**Note:** `Info` icon is already imported in `widget-editor-modal.tsx` (line 9). `Alert`, `AlertDescription` are already imported (lines 18-19). No new imports needed.

**Run:** `cd app && npx next lint --fix` — verify no lint issues.

---

### Step 9: RED — Write E2E test for cache forever mode

**File:** `app/e2e/widget-states.spec.ts`

**Add a new test describe block after "Manual run mode":**

```typescript
test.describe("Cache forever mode", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("widget with cacheMode 'forever' shows refresh button even when showRefreshButton is false", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const res = await page.request.post("/api/dashboards", {
      data: { name: `CacheForever ${Date.now()}` },
    });
    const { id } = await res.json();
    dashboardCleanup = async () => { await page.request.delete(`/api/dashboards/${id}`); };

    await page.request.put(`/api/dashboards/${id}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [{
            id: "p1",
            title: "Main",
            widgets: [{
              id: "w1",
              chartType: "table",
              connectionId: "conn-neo4j-001",
              query: "MATCH (m:Movie) RETURN m.title AS title LIMIT 5",
              settings: {
                title: "Forever Cache",
                chartOptions: { cacheMode: "forever", showRefreshButton: false },
              },
            }],
            gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 5 }],
          }],
        },
      },
    });

    await page.goto(`/${id}`);
    await expect(page.getByText("Forever Cache")).toBeVisible({ timeout: 15_000 });

    // Data should load
    await expect(page.locator("td").first()).toBeVisible({ timeout: 15_000 });

    // Refresh button should be visible even though showRefreshButton is false
    const widgetCard = page.getByTestId("widget-card").first();
    const refreshBtn = widgetCard.getByRole("button", { name: "Refresh" });
    await expect(refreshBtn).toBeVisible({ timeout: 10_000 });

    // Click refresh — data should reload without error
    await refreshBtn.click();
    await expect(page.locator("td").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Query Failed")).not.toBeVisible();
  });
});
```

**Pattern:** This follows the exact same pattern as the existing `showRefreshButton` E2E test (lines 110-159 of `widget-states.spec.ts`): create dashboard via API, seed widget via layout PUT, navigate, assert.

**Run:** `cd app && npx playwright test widget-states` — confirm the new test FAILS initially (Red), then passes after implementation.

---

### Step 10: Verify — Run all tests

1. **Unit tests (component):** `cd component && npm test`
2. **Unit tests (app):** `cd app && npm test`
3. **Lint:** `cd app && npx next lint --fix`
4. **E2E:** `cd app && npx playwright test`
5. **Build:** `npm run build`

---

## File Impact Summary

| File | Package | Change | Size |
|------|---------|--------|------|
| `component/src/components/composed/chart-options-schema.ts` | component/ | Add `cacheMode` to `behaviorOptions` | S |
| `component/src/components/composed/__tests__/chart-options-schema.test.ts` | component/ | Add tests for `cacheMode` option | S |
| `app/src/lib/resolve-cache-options.ts` | app/ | New pure function (extract from card-container) | S |
| `app/src/lib/__tests__/resolve-cache-options.test.ts` | app/ | New test file for resolve-cache-options | S |
| `app/src/hooks/use-widget-query.ts` | app/ | Add `gcTime` to options interface + pass to useQuery | S |
| `app/src/components/card-container.tsx` | app/ | Use `resolveCacheOptions`, pass `gcTime` | S |
| `app/src/components/dashboard-container.tsx` | app/ | Force `showRefresh` when `cacheMode === "forever"` | S (1 line) |
| `app/src/components/widget-editor-modal.tsx` | app/ | Add info `<Alert>` when `cacheMode === "forever"` | S |
| `app/e2e/widget-states.spec.ts` | app/ | Add E2E test for cache forever mode | S |

---

## Security Checklist

- [x] **No query modification:** Cache mode only changes TanStack Query's `staleTime`/`gcTime`. The actual query is unchanged.
- [x] **No credential exposure:** No new credential paths.
- [x] **Tenant isolation:** Query execution still goes through `/api/query` with tenant filtering.
- [x] **No XSS:** Info note text is static React content. `cacheMode` value is never rendered as HTML.
- [x] **No injection:** `cacheMode` is read from `chartOptions` (persisted JSON) and compared to string literals. Never interpolated into queries.

---

## Testing Strategy

### Unit Tests (Vitest)

| Package | File | What to Test | Status |
|---------|------|-------------|--------|
| `component/` | `chart-options-schema.test.ts` | `cacheMode` present on correct types, absent on excluded, default "ttl", select type with correct options, category "Behavior" | NEW |
| `app/` | `resolve-cache-options.test.ts` | `resolveCacheOptions` returns correct staleTime/gcTime/forceRefreshButton for ttl, forever, missing cacheMode, enableCache true/false | NEW |

### E2E Tests (Playwright)

| Spec | Scenario | Priority |
|------|----------|----------|
| `widget-states.spec.ts` | Widget with `cacheMode: "forever"` + `showRefreshButton: false` shows refresh button | HIGH |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `cacheMode: "forever"` causes memory pressure on large result sets | Low | TanStack Query with `gcTime: Infinity` keeps the data in memory until page refresh. This is expected behavior. Document in the option description. |
| User sets `cacheMode: "forever"` but forgets to refresh after data changes | Low | The forced refresh button provides an obvious affordance. The info note in the editor warns about the behavior. |
| Existing widgets with no `cacheMode` key in their `chartOptions` | None | Default is `"ttl"`, and `resolveCacheOptions` handles missing/undefined `cacheMode` by falling through to the TTL path. |
| `gcTime: undefined` passed to TanStack Query | None | TanStack Query ignores `undefined` options and uses its own default (5 minutes). Verified in TanStack Query v5 source. |

---

## Dependency Check

This task depends on Task 2.1 (refresh button + manual run). Confirmed that Task 2.1 is fully implemented on the branch:
- `showRefreshButton` and `manualRun` exist in `behaviorOptions`.
- `dashboard-container.tsx` reads `showRefreshButton` and passes `onRefresh`.
- `WidgetCard` renders refresh button via `onRefresh` prop.
- `card-container.tsx` handles `manualRun` state machine.

No blockers. Task 3.1 can proceed.
