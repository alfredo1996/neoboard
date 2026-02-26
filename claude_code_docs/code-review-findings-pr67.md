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

### 8. Data table not scrollable when row count exceeds card height

**File:** `component/src/components/composed/data-grid.tsx` (and `app/src/components/card-container.tsx`)

**Problem (User-reported):** When a widget's "rows per page" setting is increased to a value that exceeds the visible height of the card, the table overflows outside the card boundary instead of becoming vertically scrollable within it. The card container does not constrain overflow, so rows spill out rather than being accessible via scroll.

**Screenshot:** Rows visible below the card bottom edge; no scrollbar appears inside the card.

**Suggested approach:**
- Ensure `CardContainer` (or the inner content wrapper) has `overflow-y: auto` and a bounded height (e.g., `flex-1 min-h-0` in a flex column layout so it fills the card without expanding it)
- Alternatively, cap the DataGrid's container height to the remaining card space and apply `overflow-y: auto` there
- Verify the fix in both normal card size and fullscreen mode

**Priority:** Medium (edge case but user-visible; affects any widget with a large page-size setting)

---

### 9. Parameterized queries fire before parameters are set (500 error)

**File:** `app/src/components/card-container.tsx` (query execution trigger), `app/src/app/api/query/route.ts`

**Problem (User-reported):** When a dashboard has parameter widgets, the data widgets execute their queries immediately on load — before the user has selected any parameter values. If the query contains a parameter placeholder (e.g., `$param` or `{param}`), the API receives an undefined/null value, the query execution fails, and `/api/query` returns HTTP 500.

**Current behavior:** Widget shows an error state / the network tab shows a 500 on page load.

**Expected behavior:** Widgets whose queries reference one or more parameters should not execute until all required parameters have a value. Optional parameters should be allowed to execute with a default/empty value.

**Suggested approach:**
- In `CardContainer` (or the query hook), detect whether the widget's query references any parameter names (parse `{{paramName}}` or `$paramName` tokens)
- Cross-reference against the parameter store: if any referenced parameter is still `undefined`/`null`, skip the query execution (set `enabled: false` on the React Query `useQuery` call)
- Show a "Waiting for parameters…" placeholder state instead of an error
- For optional parameters, allow authors to mark them optional (default value = `""` or `null`) so the query fires immediately with the default
- add also a different message instead of the red usual one (otherwise by default an empty dashboard has a lot of red stuff)
**Priority:** High (UX regression — users see a 500 error on dashboard load when parameters are present)

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

### 10. Widget editor — required field markers and per-chart-type query hint

**File:** `app/src/components/widget-editor-modal.tsx`

**Problem (User-reported):** Two related UX gaps in the Add/Edit Widget modal.

**A) Required fields lack consistent `*` markers.**

The save button is disabled until certain fields are filled, but those fields carry no visual hint that they are required. From code analysis of the disabled condition and existing markers:

| Field | Required to save? | Has `*` today? |
|---|---|---|
| Query | Yes (save disabled when empty) | No |
| Connection | Yes (save disabled when empty) | Only for param-select widgets |
| Seed Query | Yes (param-select only) | Yes |
| Parameter Name | Yes (param-select only) | Yes |

The red asterisk pattern already exists in the file (`<span className="text-destructive">`) — it is just not applied to Query and Connection for regular (non-param) widgets.

**Suggested approach:**
- Add `<span className="text-destructive"> *</span>` to the **Query** label for all non-param-select widgets
- Remove the `isParamSelect &&` condition from the **Connection** label so the asterisk shows universally (a connection is always required)
- Add a `* Required` footnote at the bottom of the Data tab (WCAG SC 1.3.1)

**B) No per-chart-type query format hint.**

Users have no way to know what column structure a query must return for a given chart type without reading external docs. The query editor shows only a generic SQL/Cypher placeholder.

**Suggested approach:**
- Add a small `Info` icon (lucide-react, already imported) next to the Query label
- On hover it shows a shadcn `Tooltip` with a short description of the expected query shape for the selected chart type
- The icon is only shown when a chart type is selected and the widget is not a param-select

**Hint content per chart type:**

```typescript
const QUERY_HINTS: Record<string, string> = {
  bar:
    "Return 2+ columns: first = category label (string), rest = numeric series.\n" +
    "Example: RETURN genre, count(*) AS films",
  line:
    "Return 2+ columns: first = x-axis label, rest = numeric series.\n" +
    "Example: RETURN month, revenue, expenses",
  pie:
    "Return 2 columns: first = slice label (string), second = numeric value.\n" +
    "Example: RETURN category, count(*) AS total",
  "single-value":
    "Return a single row with 1 numeric column.\n" +
    "For trend mode, return 2 rows (current then previous period).\n" +
    "Example: RETURN count(n) AS total",
  graph:
    "Return nodes, relationships, or paths — not tabular data.\n" +
    "Example: MATCH (a)-[r]->(b) RETURN a, r, b",
  map:
    "Return 3 columns in order: latitude (number), longitude (number), label (string).\n" +
    "Example: RETURN lat, lng, name",
  table:
    "Return any columns — all are displayed as-is.\n" +
    "Example: SELECT * FROM orders LIMIT 100",
  json:
    "Return any data — rendered as a collapsible JSON tree.\n" +
    "Example: RETURN properties(n) AS data",
};
```

**Rendering sketch (Query label row):**

```tsx
<div className="flex items-center gap-1.5">
  <Label htmlFor="query-editor">
    Query <span className="text-destructive">*</span>
  </Label>
  {selectedChartType && QUERY_HINTS[selectedChartType] && (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm text-xs whitespace-pre-line">
        {QUERY_HINTS[selectedChartType]}
      </TooltipContent>
    </Tooltip>
  )}
</div>
```

**Notes:**
- `whitespace-pre-line` on `TooltipContent` preserves the `\n` line breaks in the hint strings
- `TooltipProvider` is already present in the modal tree
- No new dependencies — `Info` is in lucide-react, `Tooltip` is in `@neoboard/components`

**Priority:** Medium (discoverability, no breaking changes)

---

### 11. Data table — cell text should truncate with ellipsis, not wrap

**File:** `component/src/components/composed/data-grid.tsx`

**Problem (User-reported, screenshot attached):** By default, long cell values (e.g., movie taglines) wrap across multiple lines, making rows variable-height and the table visually noisy. The current behavior is also inconsistent — some columns wrap mid-word at an arbitrary character count. Hovering already reveals the full text via the browser's native title attribute (or similar), which is the right pattern, but the base display should be a single truncated line.

**Current behavior:** Cells wrap freely → rows have uneven heights → table looks unstructured for wide text columns.

**Expected behavior:** All cells render as a single line with `text-overflow: ellipsis`. The full value is readable on hover via a `title` attribute (already present or trivial to add).

**Suggested approach:**
- On the cell `<td>` / cell renderer, apply `truncate` (Tailwind: `overflow-hidden text-ellipsis whitespace-nowrap`) — this is one class in Tailwind
- Set a `title={String(cellValue)}` on the cell so the browser shows the full value natively on hover (no JS tooltip overhead)
- Make this the default; a future "wrap" column option in the Style tab could opt specific columns back into wrapping

```tsx
// In the DataGrid cell renderer:
<td
  className="... truncate max-w-[200px]"
  title={String(value)}
>
  {displayValue}
</td>
```

- The `max-w-[200px]` (or similar cap) is needed because `truncate` alone only kicks in when the container has a bounded width — without it the cell grows to fit. The exact value can be a CSS variable or a column-width setting.

**Priority:** Medium (visual consistency, affects all table widgets with text-heavy data)

---

### 12. Widget editor — preview pane should not resize with chart content

**File:** `app/src/components/widget-editor-modal.tsx` (preview section)

**Problem (User-reported):** In the widget editor modal, the right-hand preview pane expands or contracts its height to fit the rendered chart. A data table with 10 rows makes the preview tall; switching to a single-value widget collapses it. This causes the whole modal to shift layout as the user tweaks settings, which is disorienting.

**Expected behavior:** The preview pane has a fixed height at all times. The chart renders inside this fixed box — if it needs more space (e.g., a long table) it scrolls internally rather than expanding the container.

**Suggested approach:**
- Give the preview wrapper a fixed height (e.g., `h-[320px]` or `h-[40vh]`) with `overflow: hidden`
- The inner `CardContainer` / chart already fills its parent via `flex-1` or `h-full` — so constraining the parent is sufficient
- This also gives editors a realistic preview of how the widget will look inside a normal-sized dashboard card

```tsx
// In the preview section of the modal:
<div className="h-[320px] overflow-hidden rounded-lg border bg-card">
  <CardContainer widget={previewWidget} ... />
</div>
```

**Priority:** Low-Medium (UX polish; confusing but not blocking)

---

### 13. Chart options panel (Style/Advanced tab) — option description tooltips

**Files:**
- `component/src/components/composed/chart-options-schema.ts`
- `component/src/components/composed/chart-options-panel.tsx`

**Problem (User-reported):** Every option in the Style tab of the widget editor (stacked, smooth, orientation, pageSize, tileLayer, etc.) is shown as a bare label with no explanation of what it does. Users must guess or experiment to understand each setting.

**Current state (from code analysis):**
- `ChartOptionDef` interface has: `key`, `label`, `type`, `default`, `category`, `options?` — no `description` field
- `OptionField` in `chart-options-panel.tsx` renders a plain `<Label>` with no tooltip or help text
- 56 options across 9 chart types are completely undocumented in the UI

**Suggested implementation:**

_1. Add `description?: string` to `ChartOptionDef` in the schema:_
```typescript
interface ChartOptionDef {
  key: string;
  label: string;
  type: "boolean" | "select" | "text" | "number";
  default: unknown;
  category: string;
  options?: { label: string; value: string }[];
  description?: string;  // ← NEW: shown in a tooltip on the label
}
```

_2. Update `OptionField` to show a `HelpCircle` icon + shadcn `Tooltip` when `description` is set:_
```tsx
// Replace the bare <Label> with:
<Label htmlFor={option.key} className="text-sm flex items-center gap-1">
  {option.label}
  {option.description && (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {option.description}
      </TooltipContent>
    </Tooltip>
  )}
</Label>
```

`HelpCircle` is from lucide-react (already a dep). `Tooltip*` are already exported from `@neoboard/components`. `TooltipProvider` is in the app tree.

_3. Add `description` strings for all 56 existing options (full list):_
```typescript
// ── bar ──────────────────────────────────────────────────
{ key: "orientation",  description: "Vertical bars grow upward; horizontal bars grow left-to-right." },
{ key: "stacked",      description: "Stack series on top of each other instead of placing them side by side." },
{ key: "barWidth",     description: "Width of each bar as a percentage of the available slot (1–100)." },
{ key: "barGap",       description: "Gap between bar groups as a percentage of the bar width." },
{ key: "showValues",   description: "Display the numeric value as a label on each bar." },
{ key: "showLegend",   description: "Show the chart legend identifying each data series." },
{ key: "xAxisLabel",   description: "Custom label for the horizontal axis." },
{ key: "yAxisLabel",   description: "Custom label for the vertical axis." },
{ key: "showGridLines",description: "Show faint horizontal grid lines behind the bars." },
// ── line ─────────────────────────────────────────────────
{ key: "smooth",       description: "Render lines as smooth Bézier curves instead of straight segments." },
{ key: "area",         description: "Fill the area beneath the line to emphasise volume over time." },
{ key: "lineWidth",    description: "Stroke width of the line in pixels." },
{ key: "stepped",      description: "Draw the line as a step function — useful for discrete state changes." },
{ key: "showPoints",   description: "Draw a dot at each data point on the line." },
// (shared with bar: showGridLines, xAxisLabel, yAxisLabel, showLegend)
// ── pie ──────────────────────────────────────────────────
{ key: "donut",        description: "Cut a circular hole in the centre to render the chart as a donut." },
{ key: "roseMode",     description: "Vary each slice's radius by its value (Nightingale / rose chart)." },
{ key: "labelPosition",description: "Where to place the slice labels: inside, outside, or hidden." },
{ key: "showLabel",    description: "Show the category name on each slice." },
{ key: "showPercentage",description:"Show the percentage value on each slice." },
{ key: "sortSlices",   description: "Sort slices by value (largest first) for a cleaner layout." },
// ── single-value ─────────────────────────────────────────
{ key: "title",        description: "Custom heading shown above the value. Leave blank to hide." },
{ key: "prefix",       description: "Text prepended to the value (e.g. '$', '€')." },
{ key: "suffix",       description: "Text appended to the value (e.g. '%', ' items')." },
{ key: "fontSize",     description: "Font size of the main displayed value in pixels." },
{ key: "numberFormat", description: "Numeric format: auto, compact (1.2 k), percentage, or fixed decimals." },
{ key: "trendEnabled", description: "Show a trend arrow comparing the current value to the previous period." },
{ key: "colorThresholds",description:"Colour bands for the value — e.g. green below 100, red above." },
// ── graph ────────────────────────────────────────────────
{ key: "layout",       description: "Algorithm used to position nodes: force, hierarchical, or circular." },
{ key: "nodeSize",     description: "Radius of each node circle in pixels." },
{ key: "showLabels",   description: "Show the node label (first string property) on each node." },
{ key: "showRelationshipLabels", description: "Show the relationship type on each edge." },
{ key: "physics",      description: "Enable physics simulation so nodes repel and edges act as springs." },
// ── map ──────────────────────────────────────────────────
{ key: "tileLayer",    description: "Base-map tile provider. OSM is open and free; Carto is clean and minimal." },
{ key: "zoom",         description: "Initial zoom level when the map first renders (1 = world, 18 = street)." },
{ key: "minZoom",      description: "Minimum zoom level the user can zoom out to." },
{ key: "maxZoom",      description: "Maximum zoom level the user can zoom in to." },
{ key: "autoFitBounds",description: "Automatically pan and zoom to fit all markers on initial load." },
{ key: "markerSize",   description: "Radius of each map marker in pixels." },
{ key: "clusterMarkers",description:"Group nearby markers into clusters at lower zoom levels." },
{ key: "showPopup",    description: "Show a popup with the row data when a marker is clicked." },
// ── table ────────────────────────────────────────────────
{ key: "enableSorting",description: "Allow clicking column headers to sort rows." },
{ key: "enableSelection",description:"Allow selecting individual rows by clicking them." },
{ key: "enableGlobalFilter",description:"Show a search box that filters all rows across all columns." },
{ key: "enableColumnFilters",description:"Show per-column filter inputs below the header row." },
{ key: "enablePagination",description:"Show pagination controls (Previous / Next) at the bottom." },
{ key: "pageSize",     description: "Number of rows shown per page when pagination is enabled." },
{ key: "emptyMessage", description: "Text shown when the query returns no rows." },
// ── json ─────────────────────────────────────────────────
{ key: "initialExpanded",description:"Expand all JSON nodes when the viewer first renders." },
{ key: "showCopyButton",description:"Show a Copy button to copy the full JSON to the clipboard." },
{ key: "theme",        description: "Colour theme for the JSON syntax highlighting." },
// ── parameter-select ────────────────────────────────────
{ key: "placeholder",  description: "Hint text shown inside the selector when no value is chosen." },
{ key: "searchable",   description: "Allow the user to type to filter the option list." },
```

**Notes:**
- No schema type change — `description` is optional and backward-compatible; options without it render exactly as before
- Wrap `ChartOptionsPanel` usage in `<TooltipProvider>` if the modal tree doesn't already provide one (it does via `providers.tsx`)
- Update `chart-options-panel.test.tsx` to add `Tooltip*` to the mock imports and add a test: "renders HelpCircle icon when option has description"

**Priority:** Medium (developer experience + discoverability; fully backward-compatible)

---

## Summary

| #  | Finding                                           | Severity         | Status   |
|----|---------------------------------------------------|------------------|----------|
| —  | `wrapWithPreviewLimit` double-LIMIT bug           | Bug (e2e)        | ✅ Fixed |
| —  | `validatePieData` misleading message              | Cosmetic         | ✅ Fixed |
| —  | Duplicate button in-flight guard                  | UX               | ✅ Fixed |
| 1  | Multi-tenant isolation in seed query              | Security         | Pending  |
| 2  | Stale cascading child parameter                   | Logic            | Pending  |
| 3  | Date parsing timezone bug                         | Correctness      | Pending  |
| 4  | Relative date presets stale on reload             | UX               | Pending  |
| 5  | Seed query ordinal column positions               | DX               | Pending  |
| 6  | Missing abort signal on seed fetch                | Performance      | Pending  |
| 7  | App-layer test coverage gap                       | Quality          | Pending  |
| 8  | Table not scrollable when rows exceed card height | UX               | Pending  |
| 9  | Queries fire before parameters are set (500)      | UX / Correctness | Pending  |
| 10 | Widget editor: required markers + query hints     | DX / UX          | Pending  |
| 11 | Data table: cell text wraps instead of truncating | UX               | Pending  |
| 12 | Widget editor preview pane resizes with content   | UX               | Pending  |
| 13 | Style tab options have no description tooltips    | DX / UX          | Pending  |
