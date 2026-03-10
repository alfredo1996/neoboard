# Issue #93 — Widget UX Polish: Parameter Bar, Refresh, Cache, Graph Fullscreen

**Date:** 2026-03-10
**Milestone:** v0.5 Interactivity, Write & Portability
**Branch:** `feat/issue-93-widget-ux-polish`
**Base:** `dev`
**PR target:** `dev`

---

## Summary

Six self-contained UX improvements for widget interactivity and parameter management. Each item is independently shippable but some have explicit dependencies (item 5 depends on item 4). The plan orders tasks to respect those dependencies and maximize parallel work.

---

## Architecture Decisions

### AD-1: `sourceWidgetId` on ParameterEntry (item 1)
Add an optional `sourceWidgetId: string` field to `ParameterEntry` in the parameter store. This enables scroll-to-source on tag click without coupling the component/ package to app/ concerns. The `CrossFilterTag` component receives a new optional `onClick` prop; the app layer wires it to scroll logic.

### AD-2: Parameter collision detection is a pure function (item 2)
Create a new pure utility `findParameterCollisions(layout, widgetId, parameterName)` in `app/src/lib/collect-parameter-names.ts`. It scans the dashboard layout and returns widget IDs/titles that share the same parameter name. This keeps the widget-editor-modal logic clean and testable via Vitest.

### AD-3: Graph fullscreen fix uses ref callback (item 3)
The `GraphChart` component already exposes `fitGraph()` via the NVL ref. The fix is in `DashboardContainer`: after the fullscreen dialog opens, dispatch `nvl.fit()` via a `useEffect` keyed on `fullscreenWidget`. The `min-h-0` propagation issue is a CSS fix in `DialogContent`.

### AD-4: Per-widget refresh and manual run are chart options (item 4)
New `chartOptions` keys (`showRefreshButton`, `manualRun`) are added to `chart-options-schema.ts` as a shared "Behavior" category available to ALL chart types (except parameter-select and form). This means NO schema migration is needed; these are persisted inside the existing `settings.chartOptions` JSON column.

### AD-5: Cache mode is a chart option (item 5)
New `chartOptions` key `cacheMode: "ttl" | "forever"`. When `"forever"`, `CardContainer` passes `staleTime: Infinity` and `gcTime: Infinity` to `useWidgetQuery`. The refresh button is force-shown regardless of `showRefreshButton`. This keeps cache behavior co-located with other widget settings.

### AD-6: Searchable default change is a schema default change (item 6)
Change `searchable` default from `false` to `true` in `chart-options-schema.ts` for the `parameter-select` chart type. Also update `ParameterWidgetRenderer` default prop. Existing widgets with `searchable: false` explicitly saved are unaffected (value wins over default).

---

## Affected Packages

| Package | Files Changed | Reason |
|---------|--------------|--------|
| `component/` | parameter-bar.tsx, cross-filter-tag.tsx, widget-card.tsx, chart-options-schema.ts | UI changes, new props, new chart options |
| `app/` | parameter-store.ts, dashboard-container.tsx, card-container.tsx, widget-editor-modal.tsx, parameter-widget-renderer.tsx, collect-parameter-names.ts, graph-exploration-wrapper.tsx, use-widget-query.ts | Store changes, business logic, scroll-to-source, collision detection, manual run, cache mode |
| `connection/` | None | No changes needed |

---

## Ordered Tasks

### Phase 1: Independent foundations (can be developed in parallel)

#### Task 1.1 — Collapsible Parameter Bar + Simplified Display (Item 1) — Size: M

**Files to modify:**

| File | Change |
|------|--------|
| `component/src/components/composed/parameter-bar.tsx` | Add `collapsible?: boolean`, `defaultCollapsed?: boolean` props. Render a collapse/expand toggle button (ChevronDown/ChevronUp). When collapsed, hide children and action buttons, show badge count. |
| `component/src/components/composed/cross-filter-tag.tsx` | Simplify display: remove `source` prop rendering, show `field = value` only (breaking visual change but simpler UX). Add optional `onClick?: () => void` prop for navigate-to-source. Add optional `tooltip?: string` for hover info. |
| `app/src/stores/parameter-store.ts` | Add `sourceWidgetId?: string` to `ParameterEntry`. Update `setParameter` signature to accept optional `sourceWidgetId`. |
| `app/src/components/dashboard-container.tsx` | Wire `onClick` on `CrossFilterTag` to scroll the source widget into view using `document.querySelector(`[data-widget-id="${sourceWidgetId}"]`)?.scrollIntoView()`. Add `data-widget-id` attribute on widget wrapper divs. Simplify CrossFilterTag usage: pass `field={entry.field}` and `value={formatParameterValue(entry.value)}` (drop `source`). |
| `app/src/components/card-container.tsx` | Pass `sourceWidgetId` through to `setParameter` calls where the widget ID is available. |
| `app/src/components/parameter-widget-renderer.tsx` | Pass widget ID (new prop) through `setParameter` calls as `sourceWidgetId`. |

**Unit tests (component/):**
- `parameter-bar.test.tsx`: collapsible renders toggle, collapsed hides children, badge shows count.
- `cross-filter-tag.test.tsx`: simplified display (no source), onClick fires, tooltip renders.

**Unit tests (app/):**
- `parameter-store.test.ts`: `sourceWidgetId` is stored and retrievable.

**E2E tests:**
- `parameters.spec.ts`: Add test for parameter bar collapse/expand toggle, verify tag click scrolls.

---

#### Task 1.2 — Parameter Name Collision Warning (Item 2) — Size: S

**Files to modify:**

| File | Change |
|------|--------|
| `app/src/lib/collect-parameter-names.ts` | Add `findParameterCollisions(layout, currentWidgetId, parameterName): { widgetId: string; title: string }[]`. Scans all widgets except the current one. Returns widgets that use the same parameter name (via click action parameterMapping, query `$param_xxx`, or param-select chartOptions.parameterName). |
| `app/src/components/widget-editor-modal.tsx` | In parameter config sections (click action parameter name input, param-select parameter name input), call `findParameterCollisions` and show an info `<Alert>` banner: "Shared with: Widget X, Widget Y". Only show when collisions exist. |
| `component/src/components/composed/cross-filter-tag.tsx` | Already adding `tooltip` prop in Task 1.1; the tooltip content will be set by `DashboardContainer` to list which widgets share the parameter. |
| `app/src/components/dashboard-container.tsx` | Compute collision info per parameter and pass as tooltip to `CrossFilterTag`. |

**Unit tests (app/):**
- `collect-parameter-names.test.ts`: Test `findParameterCollisions` with: no collisions, single collision (click action), single collision (query ref), single collision (param-select), multiple collisions, self-exclusion.

**E2E tests:**
- `widget-states.spec.ts` or `parameters.spec.ts`: Open widget editor with a parameter name already used by another widget, verify info banner appears.

---

#### Task 1.3 — Graph Right-Click / Hover in Fullscreen (Item 3) — Size: S

**Files to modify:**

| File | Change |
|------|--------|
| `app/src/components/dashboard-container.tsx` | In the fullscreen `<Dialog>`, add a `ref` callback or `useEffect` that calls `nvl.fit()` after the dialog opens. Approach: pass a `key` prop to force remount of `CardContainer` when entering fullscreen, OR add an `onFullscreenMount` callback. Ensure `min-h-0` is on the `DialogContent` flex child wrapping the graph. |
| `component/src/charts/graph-chart.tsx` | Ensure `onNodeRightClick` fires correctly by verifying the NVL `mouseEventCallbacks` are properly bound. The `createPortal` approach for context menu already uses `document.body`, which works in fullscreen. Add an `autoFit?: boolean` prop that triggers `fitGraph()` on mount after a short delay (100ms) to handle NVL layout initialization. |
| `app/src/components/graph-exploration-wrapper.tsx` | Pass `autoFit` prop to `GraphChart` when rendering inside fullscreen context. |

**Implementation approach:**
The root cause is that NVL initializes its layout based on the container size at mount time. When the dialog opens, the container goes from 0 to large. The fix is to:
1. Force the `GraphChart` to call `fitGraph()` after mount with a short `requestAnimationFrame` delay.
2. Ensure `min-h-0` is on `<div className="flex-1 min-h-0">` inside the fullscreen dialog (already present in current code).
3. Verify `onNodeRightClick` works — the `createPortal` to `document.body` should work fine within a `<Dialog>` since dialogs don't block portals.

**Unit tests (component/):**
- `graph-chart.test.tsx`: Test that `autoFit` prop triggers fit after mount (mock NVL ref).

**E2E tests:**
- Add to `charts.spec.ts` or a new `graph-fullscreen.spec.ts`: Open a graph widget fullscreen, verify graph is visible and fits viewport. Right-click a node, verify context menu appears.

---

#### Task 1.4 — Param-Select: Always Searchable by Default (Item 6) — Size: S

**Files to modify:**

| File | Change |
|------|--------|
| `component/src/components/composed/chart-options-schema.ts` | Change `parameterSelectOptions[1]` (searchable) default from `false` to `true`. |
| `app/src/components/parameter-widget-renderer.tsx` | Change `searchable = false` default in the destructured props to `searchable = true`. |

**Unit tests (component/):**
- `chart-options-schema.test.ts` (or add if missing): Verify `getDefaultChartSettings("parameter-select").searchable === true`.

**Unit tests (app/):**
- No new unit test needed; the default is a prop change. E2E covers behavior.

**E2E tests:**
- `parameters.spec.ts`: Create a new param-select widget WITHOUT explicitly setting searchable. Verify the search input is visible in the dropdown (Command popover rendered, not Select).

---

### Phase 2: Per-Widget Refresh + Manual Run (depends on nothing)

#### Task 2.1 — Add Chart Options for Refresh and Manual Run (Item 4) — Size: M

**Files to modify:**

| File | Change |
|------|--------|
| `component/src/components/composed/chart-options-schema.ts` | Add a new `behaviorOptions: ChartOptionDef[]` array with: `showRefreshButton` (boolean, default false, category "Behavior"), `manualRun` (boolean, default false, category "Behavior"). Merge into all chart types except `parameter-select` and `form`. |
| `component/src/components/composed/widget-card.tsx` | Add optional `onRefresh?: () => void` prop. When provided, render a refresh icon button in the header (next to headerExtra). Style it as ghost/icon. |
| `app/src/components/card-container.tsx` | Read `chartOptions.showRefreshButton` and `chartOptions.manualRun`. For `showRefreshButton`: expose a `refetch` callback from `useWidgetQuery` result. For `manualRun`: initialize query with `enabled: false`, show a "Run Query" overlay button; on click, set enabled to true (use a local `useState` flag). On subsequent parameter changes, reset to "Run Query" state. |
| `app/src/components/dashboard-container.tsx` | Pass `onRefresh` callback to `WidgetCard` when `showRefreshButton` is true. Wire it to `queryClient.invalidateQueries` for that widget's query key. |
| `app/src/hooks/use-widget-query.ts` | Add an optional `manualRun` flag to the options. When true, the query starts disabled. Return an `execute` function that enables it. Also return a `refetch` function for the refresh button. |

**Implementation detail for manual run:**
```
manualRun flow:
1. Widget renders with enabled: false
2. CardContainer shows overlay: "Run Query" button
3. User clicks "Run Query" → sets local state hasRun = true → query enables
4. On parameter change → reset hasRun = false → back to overlay
```

**Unit tests (component/):**
- `chart-options-schema.test.ts`: Verify behavior options are present on bar, line, pie, table, single-value, graph, map, json. Absent on parameter-select and form.
- `widget-card.test.tsx`: Render with `onRefresh` prop, verify refresh button appears, click fires callback.

**Unit tests (app/):**
- `use-widget-query.test.ts` (if exists) or new: Test `manualRun` disables query initially, `execute()` enables it, parameter change resets.

**E2E tests:**
- `widgets.spec.ts` or `widget-states.spec.ts`: Create a widget with `showRefreshButton: true`, verify refresh button in header. Create a widget with `manualRun: true`, verify "Run Query" button shows, click it, verify data loads.

---

### Phase 3: "Run Once" Cache Forever (depends on Phase 2)

#### Task 3.1 — Cache Mode Option (Item 5) — Size: S

**Files to modify:**

| File | Change |
|------|--------|
| `component/src/components/composed/chart-options-schema.ts` | Add `cacheMode` option (select, options: "ttl"/"forever", default "ttl", category "Behavior") to the behavior options group. |
| `app/src/components/card-container.tsx` | Read `chartOptions.cacheMode`. When `"forever"`: set `staleTime: Infinity`, `gcTime: Infinity`. Force `showRefreshButton` to true regardless of the chart option value. |
| `app/src/hooks/use-widget-query.ts` | Add `gcTime` to the options interface. Pass it through to `useQuery`. |
| `app/src/components/widget-editor-modal.tsx` | When `cacheMode === "forever"` is selected, show an info note: "Data will be fetched once and cached until manually refreshed." |

**Unit tests (app/):**
- `card-container` logic (pure function extraction): Test that `cacheMode: "forever"` produces `staleTime: Infinity` and forces refresh button.

**E2E tests:**
- `widget-states.spec.ts`: Create widget with `cacheMode: "forever"`, verify refresh button appears even if `showRefreshButton` is false.

---

## Dependency Graph

```
Task 1.1 (Parameter Bar)     ──┐
Task 1.2 (Collision Warning) ──┤── Phase 1 (parallel)
Task 1.3 (Graph Fullscreen)  ──┤
Task 1.4 (Searchable Default) ─┘
                                  │
Task 2.1 (Refresh + Manual Run)  │── Phase 2 (parallel with Phase 1)
                                  │
                                  ▼
Task 3.1 (Cache Forever)      ───── Phase 3 (depends on Task 2.1)
```

---

## Migration Needed?

**No.** All new data is stored within the existing `settings.chartOptions` JSON column on the `dashboard_widgets` table. The `ParameterEntry` change is an in-memory Zustand store change. No Drizzle migration required.

---

## Security Checklist

- [ ] **No query modification:** Refresh button uses TanStack Query's `refetch()` which re-executes the same query. No new user input paths.
- [ ] **No credential exposure:** No new credential handling.
- [ ] **Tenant isolation:** `sourceWidgetId` is client-side only (Zustand store, same dashboard context). No cross-tenant risk.
- [ ] **Parameter injection:** `findParameterCollisions` only reads layout metadata; no query construction.
- [ ] **XSS:** Tooltip and collision info display use React's built-in escaping (no `dangerouslySetInnerHTML`).

---

## Testing Strategy

### Unit Tests (Vitest)

| Package | Test File | What to Test |
|---------|-----------|-------------|
| `component/` | `parameter-bar.test.tsx` | Collapsible toggle, badge count, collapsed state |
| `component/` | `cross-filter-tag.test.tsx` | Simplified display, onClick, tooltip |
| `component/` | `widget-card.test.tsx` | Refresh button rendering and callback |
| `component/` | `chart-options-schema.test.ts` | Behavior options on correct chart types, searchable default |
| `app/` | `parameter-store.test.ts` | `sourceWidgetId` field storage |
| `app/` | `collect-parameter-names.test.ts` | `findParameterCollisions` all scenarios |
| `app/` | `use-widget-query.test.ts` | `manualRun` flag, `gcTime` passthrough |

### E2E Tests (Playwright)

| Spec File | Scenarios |
|-----------|-----------|
| `parameters.spec.ts` | Collapsible parameter bar, tag click scrolls to source, searchable default |
| `widget-states.spec.ts` | Collision warning banner, refresh button, manual run overlay, cache forever |
| `charts.spec.ts` or new `graph-fullscreen.spec.ts` | Graph fits in fullscreen, right-click context menu in fullscreen |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| NVL `fit()` timing in fullscreen dialog | Medium | Use `requestAnimationFrame` + 100ms delay; add retry logic if NVL hasn't initialized yet |
| `manualRun` state reset on parameter change creates flickering | Low | Debounce the reset; only reset when parameter values actually differ |
| Changing `searchable` default may surprise users with existing param-select widgets | Low | Only affects NEW widgets; existing widgets have explicit `searchable: false` saved in chartOptions |
| Collapsible parameter bar layout shift | Low | Use CSS transitions (max-height) for smooth collapse; preserve space for toggle button |
| `cacheMode: "forever"` memory pressure on large result sets | Low | Document that "forever" cache persists until page refresh; `gcTime: Infinity` prevents TanStack from garbage-collecting |

---

## Suggested GitHub Issues (sub-issues)

If breaking #93 into smaller PRs is preferred:

1. **#93a** — Collapsible parameter bar + simplified CrossFilterTag + scroll-to-source (Tasks 1.1)
2. **#93b** — Parameter name collision warning (Task 1.2)
3. **#93c** — Graph fullscreen fit + right-click fix (Task 1.3)
4. **#93d** — Per-widget refresh button + manual run mode (Task 2.1)
5. **#93e** — "Run once" cache forever mode (Task 3.1)
6. **#93f** — Param-select searchable by default (Task 1.4)

Each sub-issue is independently mergeable. Recommended merge order: 1.4 (trivial) -> 1.3 (isolated) -> 1.2 (isolated) -> 1.1 (larger) -> 2.1 (new feature) -> 3.1 (depends on 2.1).

---

## File Impact Summary

### component/ package (UI only, no business logic)

| File | Changes |
|------|---------|
| `src/components/composed/parameter-bar.tsx` | +collapsible, +defaultCollapsed, collapse toggle button, badge count |
| `src/components/composed/cross-filter-tag.tsx` | Simplify to `field = value`, +onClick, +tooltip |
| `src/components/composed/widget-card.tsx` | +onRefresh prop, refresh icon button |
| `src/components/composed/chart-options-schema.ts` | +behaviorOptions (showRefreshButton, manualRun, cacheMode), searchable default change |
| `src/charts/graph-chart.tsx` | +autoFit prop, fit-on-mount effect |
| `src/components/composed/__tests__/parameter-bar.test.tsx` | New tests for collapsible |
| `src/components/composed/__tests__/cross-filter-tag.test.tsx` | Updated tests for simplified display |
| `src/components/composed/__tests__/widget-card.test.tsx` | New tests for refresh button |

### app/ package (orchestration, business logic)

| File | Changes |
|------|---------|
| `src/stores/parameter-store.ts` | +sourceWidgetId on ParameterEntry, updated setParameter |
| `src/components/dashboard-container.tsx` | Scroll-to-source, data-widget-id attrs, collision tooltips, refresh wiring, simplified tags |
| `src/components/card-container.tsx` | Manual run overlay, cache mode logic, refresh callback |
| `src/components/widget-editor-modal.tsx` | Collision warning banner, cache mode info note |
| `src/components/parameter-widget-renderer.tsx` | sourceWidgetId passthrough, searchable default change |
| `src/components/graph-exploration-wrapper.tsx` | autoFit prop passthrough for fullscreen |
| `src/lib/collect-parameter-names.ts` | +findParameterCollisions function |
| `src/hooks/use-widget-query.ts` | +manualRun, +gcTime options |
| `src/stores/__tests__/parameter-store.test.ts` | sourceWidgetId tests |
| `src/lib/__tests__/collect-parameter-names.test.ts` | findParameterCollisions tests |
| `e2e/parameters.spec.ts` | Collapsible, searchable default, scroll-to-source |
| `e2e/widget-states.spec.ts` | Collision warning, refresh, manual run, cache mode |
