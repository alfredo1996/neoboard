# v0.9 UX Fixes Plan

**Date:** 2026-03-20
**Branch:** `release/0.8` (will become `release/0.9` or individual fix branches off `dev`)

Nine issues identified during v0.8 release QA. Ordered by complexity (S/M/L).

---

## 1. Chart Type Selector — Searchable + Scrollable

**Size:** S
**Package:** `app/`
**File:** `app/src/components/widget-editor/chart-type-selector.tsx`

### Problem
The chart type dropdown lists all 17 types with no way to search. Too many options in one view.

### Current Implementation
- Uses shadcn `Select` component with `SelectTrigger`/`SelectContent`/`SelectItem`
- All 17 chart types rendered flat — no search, no scroll limit
- `chartTypeMeta` map provides icons for each type

### Fix
Replace the shadcn `Select` with the shadcn `Combobox` (already used for the connection selector in the same file). This gives search-as-you-type filtering for free.

**Steps:**
1. Replace `Select`/`SelectTrigger`/`SelectContent`/`SelectItem` with `Combobox` from `@neoboard/components`
2. Set `maxHeight` on the popover content (e.g. `max-h-[320px] overflow-y-auto`) so ~10 items are visible at a time
3. Each item keeps its icon + label from `chartTypeMeta`
4. The search input filters by label (case-insensitive substring match)

**Test:** Existing unit test in `component/src/components/composed/__tests__/chart-type-picker.test.tsx` — update expectations for combobox behavior.

---

## 2. Color Palette Not Working on Bar, Pie, Line Charts

**Size:** S
**Package:** `app/`
**File:** `app/src/components/chart-renderer.tsx` (lines 131–171)

### Root Cause
The `colorPalette` prop is **not passed** to `BarChart`, `PieChart`, or `LineChart` in `chart-renderer.tsx`. It IS passed to all v0.8 charts (gauge, sankey, sunburst, radar, treemap).

The settings UI (`chart-options-schema.ts`) correctly includes `colorPalette` for bar/pie/line. The components accept it via `...rest` → `BaseChart`. The only gap is the explicit prop in the renderer.

### Fix
Add `colorPalette={settings.colorPalette as string | undefined}` to the three chart JSX blocks:

```tsx
// Bar (line ~149)
colorPalette={settings.colorPalette as string | undefined}

// Line (line ~170)
colorPalette={settings.colorPalette as string | undefined}

// Pie (line ~189)
colorPalette={settings.colorPalette as string | undefined}
```

**Test:** Unit test in `app/` or E2E — render a bar chart with `colorPalette: "warm-sunset"` and verify the BaseChart receives it.

---

## 3. Remove Click Action from Gauge; Review Other New Charts

**Size:** S
**Package:** `app/`
**File:** `app/src/lib/chart-registry.ts`

### Analysis

| Chart     | Click Action | Styling | Rationale |
|-----------|-------------|---------|-----------|
| gauge     | Remove      | Keep    | Gauge is a single-value display — clicking it has no meaningful data point to extract |
| sankey    | Keep        | Keep    | Clicking nodes/links is useful for drill-down |
| sunburst  | Keep        | Keep    | Clicking segments for drill-down is standard |
| radar     | Remove      | Keep    | Radar is analytic/comparison — no meaningful click target |
| treemap   | Keep        | Keep    | Clicking blocks for drill-down is standard |

### Fix
Add explicit flags to the chart registry:

```ts
gauge: {
  ...
  supportsClickAction: false,  // ADD
},
radar: {
  ...
  supportsClickAction: false,  // ADD
},
```

Also remove `onClick={handleEChartsClick}` from gauge and radar in `chart-renderer.tsx` (lines 348, 398) for consistency.

---

## 4. Dual "Leave" Modal (App + Browser)

**Size:** M
**Package:** `app/`
**File:** `app/src/hooks/use-unsaved-changes-warning.ts`

### Root Cause
When the user confirms "Leave" in the custom `ConfirmDialog`, `confirmNavigation()` calls `window.location.href = url` or `window.history.back()`. This triggers the browser's `beforeunload` event. Since `hasUnsavedChanges()` is still `true` at that moment (the store hasn't been cleared), `e.preventDefault()` fires and the **native browser dialog** appears on top of the already-dismissed custom dialog.

### Sequence
```
User clicks "Leave" → confirmNavigation()
  → setShowNavWarning(false)
  → window.location.href = url
    → beforeunload fires
    → hasUnsavedChanges() still true
    → e.preventDefault()
    → NATIVE BROWSER DIALOG appears ← BUG
```

### Fix
Add a `navigatingRef` flag. When the user confirms navigation, set it to `true` before navigating. The `beforeunload` handler checks this flag and skips `e.preventDefault()`.

```ts
const navigatingRef = useRef(false);

// beforeunload handler:
const handler = (e: BeforeUnloadEvent) => {
  if (hasUnsavedChanges() && !navigatingRef.current) {
    e.preventDefault();
  }
};

// confirmNavigation:
const confirmNavigation = useCallback(() => {
  setShowNavWarning(false);
  navigatingRef.current = true;  // Bypass beforeunload
  if (pendingUrl.current) {
    const url = pendingUrl.current;
    pendingUrl.current = null;
    window.location.href = url;
  } else {
    window.history.back();
  }
}, []);
```

**Test:** Update `use-unsaved-changes-warning.test.ts` to verify `beforeunload` doesn't fire after confirm. E2E test: edit → change → click Back → confirm Leave → no native dialog.

---

## 5. Edit Mode Single-Column Collapse with Parameter Bar

**Size:** M
**Package:** `app/`
**Files:**
- `app/src/components/dashboard-container.tsx`
- `component/src/components/composed/dashboard-grid.tsx`

### Root Cause
`DashboardContainer` renders `ParameterBar` and `DashboardGrid` as fragment siblings. When the parameter bar appears/disappears, it triggers a re-measure of the grid container via `react-grid-layout`'s `useContainerWidth`. If the container width crosses a breakpoint threshold (e.g. 1200→996px due to layout reflow), the grid switches column counts and compacts everything into one column.

### Fix
Wrap `DashboardGrid` in an explicit flex container with `min-w-0` to isolate it from the parameter bar's layout impact:

```tsx
// In DashboardContainer, around the grid render:
<div className="flex-1 min-w-0">
  <DashboardGrid ... />
</div>
```

Alternatively, ensure the grid container width is measured from a stable parent that doesn't shift when the parameter bar toggles. The key is preventing the grid's `ResizeObserver`/`useContainerWidth` from seeing a width change caused by sibling content changes.

**Test:** E2E: set parameter via click → enter edit mode → verify grid has multiple columns (not single column).

---

## 6. Parameter Persistence After Clear + Save

**Size:** M
**Package:** `app/`
**Files:**
- `app/src/stores/parameter-store.ts`
- `app/src/app/(dashboard)/[id]/edit/page.tsx`

### Root Cause
`saveToDashboard()` only writes to localStorage when `Object.keys(parameters).length > 0`. When the user clears all parameters and saves, the in-memory state is empty — so `saveToDashboard()` **skips the write**, leaving the old localStorage entry intact. On next load, `restoreFromDashboard()` finds the stale entry and rehydrates the cleared parameters.

### Bug Sequence
1. Click action sets parameter → Zustand updated
2. Exit edit → cleanup calls `saveToDashboard()` → writes to localStorage
3. Re-enter edit → `restoreFromDashboard()` loads from localStorage ✓
4. Click Reset → `clearAll()` clears Zustand ✓
5. Save → `handleSave()` never calls `saveToDashboard()` ✗
6. Exit edit → cleanup calls `saveToDashboard()` but params empty → **skips write** ✗
7. Re-enter → stale localStorage entry rehydrated → **params reappear** ✗

### Fix
Modify `saveToDashboard()` to **remove** the localStorage key when parameters are empty:

```ts
saveToDashboard: (dashboardId) => {
  const { parameters } = get();
  const key = `${STORAGE_PREFIX}${dashboardId}`;
  if (Object.keys(parameters).length > 0) {
    localStorage.setItem(key, JSON.stringify(parameters));
  } else {
    localStorage.removeItem(key);  // ← ADD THIS
  }
},
```

**Test:** Unit test: `saveToDashboard` → `clearAll` → `saveToDashboard` again → `restoreFromDashboard` → expect empty parameters.

---

## 7. Radar Chart Spike — Auto-Scale Max Values

**Size:** M
**Package:** `app/` + `component/`
**Files:**
- `app/src/lib/chart-registry.ts` (`transformToRadarData`, lines 475–518)
- `component/src/components/composed/chart-options-schema.ts`
- `app/src/components/chart-renderer.tsx`

### Root Cause
`transformToRadarData()` hardcodes `max: 100` for all indicators:
- **Long-format** (line 493): `const max = maxKey ? Number(r[maxKey]) || 100 : 100;`
- **Wide-format** (line 511): `const indicators = keys.map((k) => ({ name: k, max: 100 }));`

When data has values like `{A: 1000, B: 5}`, both are plotted on a 0–100 scale. A=1000 spikes way beyond the grid.

### Fix — Two Parts

**Part A: Auto-scale max in transform (app/)**
When no explicit `max` column exists, compute per-indicator max from the actual data (with 10% headroom):

```ts
// Wide-format (line 511):
const maxPerCol = new Map<string, number>();
for (const r of records) {
  for (const k of keys) {
    const v = Number(r[k]) || 0;
    maxPerCol.set(k, Math.max(maxPerCol.get(k) ?? 0, v));
  }
}
const indicators = keys.map((k) => ({
  name: k,
  max: Math.ceil((maxPerCol.get(k) ?? 100) * 1.1) || 100,
}));
```

Same for long-format when no `maxKey` column is present: track observed max per indicator, then backfill.

**Part B: Expose min/max override in settings UI (component/)**
Add optional `radarMax` number input to `chart-options-schema.ts` radar options. When provided, override the auto-calculated max for all indicators. Forward from `chart-renderer.tsx` to the radar component.

**Test:** Unit test in `chart-registry.test.ts`: transform data with values `[1000, 5, 200]` → indicators should have auto-scaled max values, not 100.

---

## 8. Widget Showcase Dashboard Redesign

**Size:** L
**Package:** `scripts/`
**File:** `scripts/seed-demo.mjs`

### Current State
The seed script creates 6 dashboards: Widget Showcase, Parameter Testing, Form Testing, Click Actions, Styling Rules, New Charts (v0.8).

### New Structure
Replace the existing Widget Showcase with a redesigned dashboard. Each page demonstrates one capability:

**Page 1: Simple Charts**
One widget per chart type (bar, line, pie, single-value, table, gauge, radar, sankey, sunburst, treemap). No styling, no click actions. Just clean data visualization.

**Page 2: Rule-Based Styling**
Same chart types but each with `stylingConfig` rules demonstrating conditional coloring (e.g., bar with color thresholds, table with row highlighting, gauge with threshold color).

**Page 3: Click Actions**
Charts with click actions configured. Include a `parameter-select` widget on the page so the clicked parameter is visible. Types: bar (set-parameter), pie (set-parameter), table (multi-rule), treemap (navigate-to-page), sunburst (set-parameter).

**Page 4: Color Palettes**
One chart type (pie) rendered 6 times, once per palette: deep-ocean, warm-sunset, cool-breeze, earth-tones, neon, monochrome.

**Page 5: Accessibility**
One chart (bar) with `colorblindMode: true` to verify decal patterns render correctly.

### Steps
1. Remove the old `buildWidgetShowcase()` function
2. Build new `buildWidgetShowcase()` with the 5-page structure above
3. Keep the other 5 dashboards (Parameter Testing, Form Testing, Click Actions, Styling Rules, New Charts) as-is unless redundant with the new showcase
4. Run `scripts/seed-demo.mjs` against dev containers to verify

**Test:** Manual visual verification after seeding.

---

## 9. Sunburst Chart Sizing (DONE)

**Status:** Completed in this session.

**Fix applied** in `component/src/charts/sunburst-chart.tsx`:
- Removed explicit `r0`/`r` from levels → ECharts auto-distributes rings across full `["15%", "95%"]` radius
- Added `center: ["50%", "50%"]` for explicit centering
- Disabled labels by default (`label: { show: false }`) to prevent ECharts auto-shrink
- Level 1 keeps tangential labels (few items); levels 2-3 rely on tooltip hover
- Labels shown on hover via `emphasis.label.show`

---

## Implementation Order

| Priority | Issue | Size | Depends On |
|----------|-------|------|------------|
| 1 | #2 Color palette on bar/pie/line | S | None |
| 2 | #3 Remove click action from gauge/radar | S | None |
| 3 | #1 Searchable chart selector | S | None |
| 4 | #4 Dual leave modal | M | None |
| 5 | #6 Parameter persistence after clear | M | None |
| 6 | #5 Edit mode single-column | M | None |
| 7 | #7 Radar auto-scale max | M | None |
| 8 | #8 Widget showcase redesign | L | #2, #3 (palette + click action fixes should land first) |
| 9 | ~~#9 Sunburst sizing~~ | ~~S~~ | ~~Done~~ |
