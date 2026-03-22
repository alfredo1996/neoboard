# Chart Improvements Plan -- Best-in-Class Quality for Every Widget Type

**Date**: 2026-03-22
**Author**: Claude Opus (planning agent)
**Scope**: All 18 chart/widget types across `component/` and `app/` packages
**Effort Estimate**: ~6-8 sprints (3-4 months), 35+ issues

---

## Table of Contents

1. [Summary](#summary)
2. [Architecture Decisions](#architecture-decisions)
3. [Cross-Cutting Improvements](#cross-cutting-improvements)
4. [Per-Chart-Type Analysis](#per-chart-type-analysis)
   - [Bar Chart](#1-bar-chart)
   - [Line Chart](#2-line-chart)
   - [Pie Chart](#3-pie-chart)
   - [Single Value](#4-single-value)
   - [Table (DataGrid)](#5-table-datagrid)
   - [Graph (Neo4j NVL)](#6-graph-neo4j-nvl)
   - [Map (Leaflet)](#7-map-leaflet)
   - [JSON Viewer](#8-json-viewer)
   - [Markdown](#9-markdown)
   - [iFrame](#10-iframe)
   - [Gauge](#11-gauge)
   - [Radar](#12-radar)
   - [Sankey](#13-sankey)
   - [Sunburst](#14-sunburst)
   - [Treemap](#15-treemap)
   - [Form Widget](#16-form-widget)
   - [Parameter Widgets](#17-parameter-widgets)
5. [Testing Strategy](#testing-strategy)
6. [Risks](#risks)
7. [Suggested GitHub Issues](#suggested-github-issues)

---

## Summary

This plan audits every chart and widget type in NeoBoard against ECharts best practices, competitor feature sets (Grafana, Metabase, Apache Superset), and modern UX standards. Each chart type receives analysis across seven dimensions: current state, library best practices, UX improvements, click actions, rule-based styling, accessibility, and missing features.

The improvements are organized into three tiers:
- **Tier 1 (High Impact / Low Effort)**: DataZoom for bar/line, export to CSV/PNG, tooltip improvements, keyboard navigation
- **Tier 2 (Medium Impact / Medium Effort)**: Advanced click actions (drill-down, multi-parameter), markLine/markPoint annotations, heatmap table cells, map clustering/heatmap layer
- **Tier 3 (High Impact / High Effort)**: Brush selection, dashboard-level cross-filtering bus, graph path highlighting, real-time streaming

---

## Architecture Decisions

### AD-1: DataZoom as a shared BaseChart feature
DataZoom (scroll-to-zoom on data axis) should be a shared option in `base-chart.tsx` via a `enableDataZoom` prop, not duplicated per chart. This keeps bundle size constant and provides a consistent interaction pattern.

**Affected files**:
- `component/src/charts/base-chart.tsx` -- add `enableDataZoom` prop
- `component/src/charts/types.ts` -- add to `BaseChartProps`
- `component/src/components/composed/chart-options-schema.ts` -- add shared option
- Every ECharts chart component that builds its own `EChartsOption`

### AD-2: Export functionality at the WidgetCard level
CSV and PNG export buttons belong in the `WidgetCard` header (next to refresh), not inside individual chart components. The chart instance exposes `getDataURL()` for image export; CSV export uses the raw data from `CardContainer`.

**Affected files**:
- `component/src/components/composed/widget-card.tsx` -- add export actions
- `app/src/components/card-container.tsx` -- pass raw data + chart ref up

### AD-3: Enhanced click action types
Current click actions support `set-parameter`, `navigate-to-page`, and the combination. We should add:
- `open-url` -- navigate to an external URL with template placeholders
- `drill-down` -- auto-navigate to a child page with context parameters
- `multi-parameter` -- set multiple parameters from different fields in one click

**Affected files**:
- `app/src/lib/db/schema.ts` -- extend `ClickAction` type
- `app/src/lib/resolve-click-action.ts` -- handle new types
- `app/src/components/widget-editor-modal.tsx` -- UI for configuring new types

### AD-4: Tooltip formatter factory
Instead of each chart defining its own tooltip, create a shared `buildTooltip()` utility that respects number formatting, prefix/suffix, and unit configuration. This ensures consistent tooltip UX across all ECharts chart types.

**Affected files**:
- `component/src/charts/chart-utils.ts` -- new `buildTooltipFormatter()` function
- All ECharts chart components

### AD-5: Accessibility layer enhancement
ECharts has a built-in `aria` component that generates screen-reader descriptions. We already enable it with `aria.enabled: true` and support decal patterns via `colorblindMode`. We should enhance this with:
- Custom `aria.label.description` templates per chart type
- Keyboard navigation via `keyboardNavigation` (ECharts v5.4+)
- High-contrast mode option (separate from colorblind mode)

**Affected files**:
- `component/src/charts/base-chart.tsx` -- enhanced aria config
- `component/src/components/composed/chart-options-schema.ts` -- new accessibility options

---

## Cross-Cutting Improvements

### CC-1: DataZoom for axis-based charts (bar, line) [S]

**Current state**: No data zoom. Users with >20 categories see cramped axis labels.

**Proposed change**: Add `dataZoom` option to `chart-options-schema.ts` for bar and line charts. When enabled, renders both an `inside` (mouse wheel/pinch) and `slider` DataZoom component.

**Files to modify**:
- `component/src/components/composed/chart-options-schema.ts`:
  ```ts
  // Before: barOptions and lineOptions have no dataZoom entry
  // After: add to both arrays:
  { key: "enableDataZoom", label: "Enable Data Zoom", type: "boolean", default: false, category: "Interaction", description: "Allow scrolling and zooming on the data axis for large datasets." }
  ```
- `component/src/charts/bar-chart.tsx`: Add `enableDataZoom` prop; when true, add `dataZoom: [{ type: 'inside' }, { type: 'slider', height: 20, bottom: 4 }]` to the ECharts option.
- `component/src/charts/line-chart.tsx`: Same pattern.
- `app/src/components/chart-renderer.tsx`: Pass `enableDataZoom` from settings.

**Tests**:
- `component/src/charts/__tests__/bar-chart.test.tsx`: Test that dataZoom config appears in ECharts options when enabled.
- `component/src/charts/__tests__/line-chart.test.tsx`: Same.

### CC-2: Export to CSV and PNG [M]

**Current state**: No export. Users screenshot manually.

**Proposed change**: Add export dropdown to `WidgetCard` header (next to refresh button). Two options:
- "Export as PNG" -- uses ECharts `getDataURL()` or `html2canvas` for non-ECharts widgets
- "Export as CSV" -- converts raw data array to CSV string, triggers download

**Files to modify**:
- `component/src/components/composed/widget-card.tsx`: Add `onExportPng` and `onExportCsv` callback props; render download icon with dropdown.
- `app/src/components/card-container.tsx`: Implement `handleExportPng` (via chart ref) and `handleExportCsv` (from raw data).
- `app/src/lib/export-utils.ts` (new): Helper functions `dataToCsv(records)` and `downloadFile(content, filename, mime)`.

**Tests**:
- `app/src/lib/__tests__/export-utils.test.ts`: Unit tests for CSV generation, edge cases (special chars, nested objects).
- `component/src/components/composed/__tests__/widget-card.test.tsx`: Test export buttons render when callbacks provided.

### CC-3: Consistent empty state with action hints [S]

**Current state**: `buildEmptyDataOption()` shows "No data" text in the center. No guidance.

**Proposed change**: Enhance empty states per chart type with helpful hints (e.g., "Your query returned no rows" for data charts, "Query must return lat/lng columns" for map).

**Files to modify**:
- `component/src/charts/chart-utils.ts`: `buildEmptyDataOption(hint?: string)` parameter.
- Each chart component: Pass chart-specific hint string.

**Tests**:
- `component/src/charts/__tests__/bar-chart.test.tsx`: Verify hint text in empty state.

### CC-4: Shared tooltip formatter with number formatting [S]

**Current state**: Each chart hardcodes its tooltip format string. No support for user-configured number formats.

**Proposed change**: Create `buildTooltipFormatter(options: { prefix?, suffix?, numberFormat? })` in `chart-utils.ts`. Charts that support tooltip customization use this factory.

**Files to modify**:
- `component/src/charts/chart-utils.ts`: New `buildTooltipFormatter()` function.
- `component/src/charts/bar-chart.tsx`, `line-chart.tsx`, `pie-chart.tsx`: Use the formatter.
- `component/src/components/composed/chart-options-schema.ts`: Add `tooltipFormat` option for bar/line/pie.

**Tests**:
- `component/src/charts/__tests__/chart-utils.test.ts` (new or extend existing): Unit tests for formatter output.

### CC-5: Keyboard navigation and high-contrast mode [M]

**Current state**: `colorblindMode` toggles decal patterns. No keyboard navigation. No high-contrast mode.

**Proposed change**:
1. Add `keyboardNavigation` prop to `BaseChart`. When enabled, set `keyboardNavigation: { enabled: true }` in ECharts options.
2. Add `highContrast` option that applies a high-contrast theme override (thicker borders, larger labels, stronger contrast ratios).
3. Add these to `accessibilityOptions` in chart-options-schema.

**Files to modify**:
- `component/src/charts/base-chart.tsx`: Handle `keyboardNavigation` and `highContrast` props.
- `component/src/charts/types.ts`: Add to `BaseChartProps`.
- `component/src/components/composed/chart-options-schema.ts`: Add options.

**Tests**:
- `component/src/charts/__tests__/base-chart.test.tsx`: Verify keyboard nav config propagated.

### CC-6: MarkLine / MarkPoint annotations for bar and line [M]

**Current state**: No reference lines, thresholds, or annotations.

**Proposed change**: Add `referenceLines` array option for bar and line charts. Each entry has `{ type: 'average' | 'min' | 'max' | 'value', value?: number, label?: string, color?: string }`. Rendered as ECharts `markLine`.

**Files to modify**:
- `component/src/charts/bar-chart.tsx`: Accept `referenceLines` prop, map to `markLine.data`.
- `component/src/charts/line-chart.tsx`: Same.
- `component/src/components/composed/chart-options-schema.ts`: New `referenceLines` option (type: "text", JSON array).
- `app/src/components/chart-renderer.tsx`: Parse and pass.

**Tests**:
- `component/src/charts/__tests__/bar-chart.test.tsx`: Test markLine appears in ECharts config.
- `component/src/charts/__tests__/line-chart.test.tsx`: Same.

---

## Per-Chart-Type Analysis

### 1. Bar Chart

**Current state -- what works well**:
- Vertical/horizontal orientation
- Stacked mode for multi-series
- Show values on bars
- Responsive (compact mode below 300px)
- Rule-based styling with per-bar coloring
- Color palette selection and colorblind mode
- Emphasis focus on series hover

**ECharts best practices not yet implemented**:
- `dataZoom` for large category lists (see CC-1)
- `markLine` for average/min/max reference lines (see CC-6)
- `selectedMode` for click-to-select bars
- `barBorderRadius` for rounded bars (modern look)
- `animation` config (entrance animation type/duration)
- `large: true` mode for >5000 data points (progressive rendering)
- Gradient fill via `LinearGradient`

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| B-1 | Rounded bar corners option | S | P2 |
| B-2 | Y-axis auto-scaling with padding (nice round numbers) | S | P1 |
| B-3 | Category axis label rotation (auto/45/90) | S | P1 |
| B-4 | Negative value handling (diverging bar chart) | M | P2 |
| B-5 | Top-N filtering (show only top 10, group rest as "Other") | M | P3 |
| B-6 | Percentage mode (normalize stacked to 100%) | S | P2 |

**Click actions (current + proposed)**:
- Current: `onClick` fires ECharts click event -> resolves to set-parameter or navigate.
- Proposed: Add `selectedMode: 'single'` support. Clicking a bar highlights it and triggers cross-filter. Clicking again deselects.

**Rule-based styling**:
- Current: `resolveItemColor()` applies per-bar color from styling rules.
- Proposed: Support `borderColor` and `borderWidth` as styling targets. Add "gradient" color option (two-color interpolation based on value).

**Accessibility**:
- Current: `colorblindMode` decal patterns, `aria.enabled`.
- Proposed: Add `aria.label.description` template: "Bar chart showing {seriesCount} series across {categoryCount} categories."

**Missing vs competitors**:
- Grafana: Threshold bands (colored horizontal zones), annotations timeline
- Metabase: Auto-binning for continuous data, goal line
- Superset: Time-series bars with rolling average overlay

**Files to modify**:
- `component/src/charts/bar-chart.tsx`
- `component/src/components/composed/chart-options-schema.ts` (barOptions)
- `app/src/components/chart-renderer.tsx`

---

### 2. Line Chart

**Current state -- what works well**:
- Smooth/stepped/straight line modes
- Area fill
- Multi-series with legend
- Data point markers toggle
- Line width customization
- Responsive compact mode

**ECharts best practices not yet implemented**:
- `dataZoom` for time-series scrolling (see CC-1)
- `markLine` for goal/threshold reference lines (see CC-6)
- `markPoint` for min/max annotations
- `markArea` for colored bands (e.g., "danger zone" above 90%)
- `sampling: 'lttb'` for large datasets (Largest-Triangle-Three-Buckets downsampling)
- `connectNulls` option for handling missing data points
- `endLabel` for labeling the end of each series (Grafana-style)

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| L-1 | Connect nulls option | S | P1 |
| L-2 | End labels (series name at line end) | S | P2 |
| L-3 | Min/max auto-annotations (markPoint) | S | P2 |
| L-4 | Time-axis detection and formatting | M | P1 |
| L-5 | Dual Y-axis support (two different scales) | M | P2 |
| L-6 | Large dataset sampling (LTTB at >1000 points) | S | P1 |

**Click actions**:
- Current: Same as bar chart.
- Proposed: Click on a data point should include the x-value and series name in the click payload. Support `markArea` click for range selection.

**Rule-based styling**:
- Current: `resolveItemColor()` colors entire line based on last value.
- Proposed: Per-segment coloring using ECharts `visualMap` (color line segments based on value ranges -- e.g., green below threshold, red above).

**Accessibility**:
- Proposed: `aria.label.description` template: "Line chart with {seriesCount} series over {pointCount} data points."

**Missing vs competitors**:
- Grafana: Threshold bands, alert state coloring, stacked percentage area, log scale Y-axis
- Metabase: Trend line overlay, goal line
- Superset: Predictive analytics overlay, annotation layers

**Files to modify**:
- `component/src/charts/line-chart.tsx`
- `component/src/components/composed/chart-options-schema.ts` (lineOptions)
- `app/src/components/chart-renderer.tsx`

---

### 3. Pie Chart

**Current state -- what works well**:
- Donut mode
- Rose/Nightingale mode
- Label positioning (outside/inside/center)
- Percentage display
- Sort by value
- Scrollable legend

**ECharts best practices not yet implemented**:
- `selectedMode: 'single'` for click-to-select slice
- `selectedOffset` for pulling out selected slice
- `padAngle` for gaps between slices (ECharts v5.5+)
- `minShowLabelAngle` to hide labels for tiny slices
- `labelLayout` for collision avoidance

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| P-1 | Top-N slices with "Other" grouping | M | P1 |
| P-2 | Selected slice "pull out" on click | S | P2 |
| P-3 | Min-angle label hiding (auto-hide tiny slice labels) | S | P1 |
| P-4 | Center text for donut (total value or custom label) | S | P1 |
| P-5 | Semi-circle (half-donut) mode | S | P3 |
| P-6 | Nested donut (two-level hierarchy) | L | P3 |

**Click actions**:
- Current: ECharts click -> set-parameter with `name` field.
- Proposed: `selectedMode: 'single'` -- clicking a slice visually selects it (pull-out) AND triggers the cross-filter.

**Rule-based styling**:
- Current: Per-slice color from `resolveItemColor()`.
- Proposed: Support `borderColor` and `borderWidth` per slice. Support "highlight" target that controls the emphasis glow color.

**Accessibility**:
- Proposed: `aria.label.description`: "Pie chart with {sliceCount} slices. Largest: {name} at {percent}%."

**Missing vs competitors**:
- Grafana: N/A (pie is basic in Grafana)
- Metabase: "Other" grouping for small slices, percentage on hover
- Superset: Nested donut, label auto-adjustment

**Files to modify**:
- `component/src/charts/pie-chart.tsx`
- `component/src/components/composed/chart-options-schema.ts` (pieOptions)
- `app/src/components/chart-renderer.tsx`

---

### 4. Single Value

**Current state -- what works well**:
- Title, prefix, suffix
- Number formatting (plain, comma, compact, percent)
- Font size options (sm/md/lg/xl)
- Trend indicator (up/down/neutral arrow)
- Rule-based styling for text color and background color
- Loading and error states

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| SV-1 | Sparkline below the value (mini line/bar from secondary query) | L | P2 |
| SV-2 | Icon option (show an icon from lucide next to value) | S | P3 |
| SV-3 | Decimal places configuration | S | P1 |
| SV-4 | Animate value changes (count-up animation) | M | P2 |
| SV-5 | Goal progress indicator (value / goal as progress bar) | M | P2 |
| SV-6 | Comparison row (current vs previous with delta) | M | P1 |

**Click actions**:
- Current: `supportsClickAction: false` in registry.
- Proposed: Enable click action. Clicking the entire card should trigger set-parameter or navigate. The value itself becomes the parameter value.

**Rule-based styling**:
- Current: Text color and background color from rules.
- Proposed: Add "icon" target (change trend arrow color), add "border" target (border color changes with value).

**Accessibility**:
- Current: Uses semantic HTML (`<Card>`, `<h3>`).
- Proposed: Add `role="status"` to the value element. Add `aria-live="polite"` so screen readers announce value changes.

**Missing vs competitors**:
- Grafana: Sparkline, color mode (value/background/none), threshold-based icon
- Metabase: Comparison to previous period with auto-calculation
- Superset: Big number with trendline

**Files to modify**:
- `component/src/charts/single-value-chart.tsx`
- `component/src/components/composed/chart-options-schema.ts` (singleValueOptions)
- `app/src/lib/chart-registry.ts`: Change `supportsClickAction` to `true` for `single-value`

---

### 5. Table (DataGrid)

**Current state -- what works well**:
- TanStack Table with sorting, filtering, pagination
- Dynamic page sizing from container height
- Row selection with checkbox
- Cell click actions with highlighted clickable cells
- Per-column filters (faceted)
- Global search
- Row styling via `getRowStyle`
- Custom toolbar/pagination render props

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| T-1 | Column resizing (drag column borders) | M | P1 |
| T-2 | Column reordering (drag-and-drop headers) | M | P2 |
| T-3 | Cell-level conditional formatting (heatmap colors) | M | P1 |
| T-4 | Frozen/pinned columns (first N columns fixed on scroll) | M | P2 |
| T-5 | Column type detection and formatting (auto-format dates, numbers, URLs) | M | P1 |
| T-6 | Expandable rows (nested data preview) | L | P3 |
| T-7 | Multi-column sort | S | P2 |
| T-8 | CSV export from table toolbar | S | P1 |
| T-9 | Row count display in footer | S | P1 |

**Click actions**:
- Current: Cell-click fires `{ _clickedColumn, _clickedValue }`. Multi-rule resolution by `triggerColumn`.
- Proposed: Add "row click" mode (entire row sets multiple parameters from different columns). Add "link column" mode (render a specific column as a clickable link that opens a URL).

**Rule-based styling**:
- Current: `backgroundColor` and `textColor` targets. Applied per-row via `getRowStyle`.
- Proposed:
  - Cell-level styling (color individual cells, not just entire rows)
  - Heatmap mode (auto-color numeric columns on a gradient scale)
  - Data bar (render a mini progress bar inside numeric cells, like Excel)
  - Icon column (show icon based on value -- checkmark, X, warning)

**Accessibility**:
- Current: Standard `<table>` semantics with `aria-label` on checkboxes.
- Proposed: Add `aria-sort` on sorted columns. Add `aria-rowcount` and `aria-colcount` on the table.

**Missing vs competitors**:
- Grafana: Cell heatmap, data bars, link columns, column width persistence
- Metabase: Mini bar charts in cells, row-level detail drill-down, pivot tables
- Superset: Pivot table mode, cell bars, cross-filtering on cell click

**Files to modify**:
- `component/src/components/composed/data-grid.tsx`
- `component/src/components/composed/data-grid-column-header.tsx`
- `component/src/components/composed/chart-options-schema.ts` (tableOptions)
- `app/src/components/table-renderer.tsx`
- `app/src/lib/chart-registry.ts` (add cell-level styling targets)

---

### 6. Graph (Neo4j NVL)

**Current state -- what works well**:
- NVL rendering with force/circular/hierarchical layouts
- Label color palette (theme-aware)
- Overlay toolbar (fit, layout switcher, label settings)
- Node selection, double-click expansion
- Right-click context menu support
- Caption map per label type
- Node size scaling
- Physics toggle

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| G-1 | Node property panel (click node -> side panel with all properties) | M | P1 |
| G-2 | Edge labels on hover (reduce clutter, show on hover) | S | P2 |
| G-3 | Path highlighting (click two nodes -> highlight shortest path) | L | P2 |
| G-4 | Node grouping/clustering by label | L | P3 |
| G-5 | Search nodes (text search within visible nodes) | M | P2 |
| G-6 | Node size by property (map a numeric property to node radius) | M | P2 |
| G-7 | Edge thickness by property (map weight to edge width) | S | P2 |
| G-8 | Zoom controls (+ / - buttons) | S | P1 |
| G-9 | Node count indicator in toolbar | S | P1 |
| G-10 | Fullscreen mode | S | P1 |

**Click actions**:
- Current: Node click toggles selection; double-click fires `onExpandRequest`. Click action resolves `nodeId`.
- Proposed: Support click action on edges (set parameter from relationship type/property). Support right-click context menu with "expand neighbors", "hide node", "pin node".

**Rule-based styling**:
- Current: `supportsStyling: false`.
- Proposed: Enable rule-based styling:
  - Node color by property value (e.g., status = "active" -> green)
  - Node border/badge by label
  - Edge color by relationship type

**Accessibility**:
- Current: Buttons have `aria-label`. Canvas-based rendering is inherently inaccessible.
- Proposed: Add text-based summary above the graph: "{nodeCount} nodes, {edgeCount} relationships across {labelCount} label types." Add keyboard support: Tab to focus toolbar, arrow keys to navigate nodes (requires NVL API).

**Missing vs competitors**:
- Neo4j Browser/Bloom: Node inspector panel, expand/collapse, undo, path finding
- Grafana Node Graph: Click-to-drill, edge tooltip, stats overlay
- Superset: N/A (no graph)

**Files to modify**:
- `component/src/charts/graph-chart.tsx`
- `component/src/components/composed/chart-options-schema.ts` (graphOptions)
- `app/src/components/graph-exploration-wrapper.tsx`
- `app/src/lib/chart-registry.ts` (enable styling)

---

### 7. Map (Leaflet)

**Current state -- what works well**:
- Circle markers with configurable size
- Tile layer presets (OSM, Carto Light, Carto Dark)
- Auto-fit bounds
- Tooltip and popup on click
- Theme-aware tile selection
- Marker size from value
- Cluster markers option
- ResizeObserver for container changes

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| M-1 | Heatmap layer (density visualization using leaflet.heat) | M | P2 |
| M-2 | Custom marker icons (by category/label) | M | P3 |
| M-3 | Polyline/polygon support (draw routes or regions) | L | P3 |
| M-4 | Color markers by value (gradient from low to high) | S | P1 |
| M-5 | Legend overlay for marker colors | S | P2 |
| M-6 | Geocoding integration (resolve addresses to lat/lng) | L | P3 |
| M-7 | Draw tools (measure distance, draw area) | L | P3 |
| M-8 | Marker popup customization (template with row data) | M | P2 |

**Click actions**:
- Current: Marker click fires `{ id, label, lat, lng }`.
- Proposed: Include all row properties in the click payload so any field can be used as a parameter.

**Rule-based styling**:
- Current: `supportsStyling: false`.
- Proposed: Enable styling:
  - Marker color by value (gradient or threshold-based)
  - Marker size by value (proportional scaling)
  - Marker opacity by value

**Accessibility**:
- Current: No specific a11y beyond standard HTML.
- Proposed: Add ARIA roles. Add keyboard navigation (Tab through markers, Enter to open popup). Add `aria-label` on the map container: "Map showing {markerCount} locations."

**Missing vs competitors**:
- Grafana Geomap: Heatmap layer, marker icons, route visualization, threshold coloring
- Metabase: Pin map, grid map, region map (choropleth)
- Superset: deck.gl 3D maps, choropleth, scatter plot on map

**Files to modify**:
- `component/src/charts/map-chart.tsx`
- `component/src/components/composed/chart-options-schema.ts` (mapOptions)
- `app/src/components/chart-renderer.tsx`
- `app/src/lib/chart-registry.ts` (enable styling)

---

### 8. JSON Viewer

**Current state -- what works well**:
- Recursive tree rendering with expand/collapse
- Syntax coloring for types (string, number, boolean, null)
- Configurable initial expand depth
- Item count for collapsed arrays/objects
- Hover highlight

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| J-1 | Search/filter within JSON (highlight matching keys/values) | M | P1 |
| J-2 | Copy individual value on click | S | P1 |
| J-3 | Copy path to clipboard (e.g., "data[0].name") | S | P2 |
| J-4 | Expand all / Collapse all buttons | S | P1 |
| J-5 | Line numbers | S | P3 |
| J-6 | Diff view (compare two query results) | L | P3 |

**Click actions**: Not applicable (supportsClickAction: false). Keep as-is.

**Rule-based styling**: Not applicable. Keep as-is.

**Accessibility**:
- Current: Click to expand/collapse with no keyboard support.
- Proposed: Add `role="tree"` and `role="treeitem"`. Arrow keys to navigate, Enter/Space to expand/collapse. Focus indicator on current node.

**Missing vs competitors**:
- Grafana: N/A (no dedicated JSON panel)
- Metabase: N/A
- Superset: N/A

**Files to modify**:
- `component/src/components/composed/json-viewer.tsx`
- `component/src/components/composed/chart-options-schema.ts` (jsonOptions)

---

### 9. Markdown

**Current state -- what works well**:
- Custom parser (no heavy dependency)
- Headings, bold, italic, code, links, images, lists, blockquotes, fenced code, strikethrough, horizontal rules
- XSS protection (escapeHtml before inline processing)
- URL validation (blocks javascript: and other dangerous schemes)
- Parameter substitution ($param_xxx)
- Empty state with guidance

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| MD-1 | Tables (GFM-style pipe tables) | M | P1 |
| MD-2 | Task lists (- [x] checkbox syntax) | S | P2 |
| MD-3 | Auto-linking bare URLs | S | P2 |
| MD-4 | Syntax highlighting in code blocks (consider lightweight highlight.js integration) | M | P3 |
| MD-5 | Math/LaTeX support (KaTeX) | L | P3 |

**Click actions**: Not applicable. Keep as-is.

**Rule-based styling**: Not applicable. Keep as-is.

**Accessibility**:
- Current: Standard HTML semantics.
- Proposed: Ensure all generated HTML uses proper heading hierarchy. Add `lang` attribute on code blocks.

**Missing vs competitors**:
- Grafana Text panel: HTML mode, full markdown, variable interpolation
- Metabase: Text card with limited formatting
- Superset: Markdown component with full CommonMark

**Files to modify**:
- `component/src/components/composed/markdown-widget.tsx`

---

### 10. iFrame

**Current state -- what works well**:
- URL validation (http/https only)
- Sandbox policy with safe token allowlist
- `referrerPolicy: "no-referrer"` for privacy
- Lazy loading
- Empty state for missing/invalid URL
- Parameter substitution in URL

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| IF-1 | Loading indicator while iframe loads | S | P1 |
| IF-2 | Refresh button (reload iframe content) | S | P2 |
| IF-3 | Height auto-sizing (listen for postMessage from child) | M | P3 |
| IF-4 | Error state when iframe fails to load (onerror handler) | S | P1 |

**Click actions**: Not applicable. Keep as-is.

**Rule-based styling**: Not applicable. Keep as-is.

**Accessibility**:
- Current: `title` prop for `<iframe>` element.
- Proposed: Ensure `title` is always non-empty (enforce default). Add `aria-label` on the container.

**Missing vs competitors**:
- Grafana: N/A (no iframe panel by default, available as plugin)
- Metabase: N/A
- Superset: Filter box can embed external content

**Files to modify**:
- `component/src/components/composed/iframe-widget.tsx`
- `component/src/components/composed/chart-options-schema.ts` (iframeOptions)

---

### 11. Gauge

**Current state -- what works well**:
- Configurable min/max range
- Progress arc and pointer toggle
- Value detail display
- Start/end angle customization
- Responsive compact mode (< 200px)
- Rule-based styling (gauge color)
- Color palette support

**ECharts best practices not yet implemented**:
- Multi-gauge (multiple pointers on one gauge)
- Split colored progress arcs (green/yellow/red zones)
- Rich label formatting in detail (`{value|{value}}` with custom styles)
- Title positioning options

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| GA-1 | Threshold zones (colored arcs for ranges) | M | P1 |
| GA-2 | Number formatting for gauge value (comma, compact, percent) | S | P1 |
| GA-3 | Multiple gauge pointers (compare two values) | M | P3 |
| GA-4 | Ring/meter gauge style (simpler look for small widgets) | S | P2 |
| GA-5 | Animation speed configuration | S | P3 |

**Click actions**:
- Current: `supportsClickAction: false`.
- Proposed: Enable click action. Clicking the gauge sets the current value as a parameter.

**Rule-based styling**:
- Current: Single "Gauge Color" target changes the progress arc color.
- Proposed: Add "Threshold Zones" target -- automatically color the gauge arc in segments (e.g., 0-50 green, 50-80 yellow, 80-100 red) based on styling rules.

**Accessibility**:
- Proposed: Add `aria.label.description`: "Gauge showing {value} out of {max}. {name}."

**Missing vs competitors**:
- Grafana: Threshold bands, show/hide thresholds, gauge mode (basic/gradient/LCD)
- Metabase: N/A (no gauge)
- Superset: N/A

**Files to modify**:
- `component/src/charts/gauge-chart.tsx`
- `component/src/components/composed/chart-options-schema.ts` (gaugeOptions)
- `app/src/lib/chart-registry.ts` (enable click action)

---

### 12. Radar

**Current state -- what works well**:
- Polygon and circle shape options
- Filled area toggle
- Multi-series support with legend
- Auto-scaling from observed values (+10% headroom)
- Long-format and wide-format data support
- Rule-based styling (area color based on average value)

**ECharts best practices not yet implemented**:
- `splitArea.show` for alternating background bands
- Custom `name.formatter` for indicator labels
- `axisLine` styling per indicator
- `tooltip` with custom value formatting

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| R-1 | Custom max per indicator (from data or user config) | S | P2 |
| R-2 | Alternating background bands (zebra stripes) | S | P2 |
| R-3 | Indicator label rotation for long names | S | P2 |
| R-4 | Animation configuration | S | P3 |

**Click actions**:
- Current: `supportsClickAction: false`.
- Proposed: Enable click on individual data points. Clicking a point on an indicator axis sets that indicator name as a parameter.

**Rule-based styling**:
- Current: "Area Color" target based on series average.
- Proposed: Per-indicator coloring (color each axis segment differently based on value).

**Accessibility**:
- Proposed: `aria.label.description`: "Radar chart comparing {seriesCount} entities across {indicatorCount} metrics."

**Missing vs competitors**:
- Grafana: N/A (no radar)
- Metabase: N/A
- Superset: Radar chart with basic configuration

**Files to modify**:
- `component/src/charts/radar-chart.tsx`
- `component/src/components/composed/chart-options-schema.ts` (radarOptions)

---

### 13. Sankey

**Current state -- what works well**:
- Horizontal/vertical orientation
- Node labels toggle
- Node width and gap configuration
- Gradient link colors
- Emphasis focus on adjacency
- Rule-based styling for link colors
- Responsive compact mode

**ECharts best practices not yet implemented**:
- `draggable: true` to let users rearrange nodes
- `focusNodeAdjacency` for better interaction
- Custom node coloring (currently uses default palette)
- Label formatting with value display
- `layoutIterations` for layout quality tuning

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| SK-1 | Draggable nodes | S | P2 |
| SK-2 | Node color by category | M | P2 |
| SK-3 | Show values on links (as labels) | S | P1 |
| SK-4 | Tooltip showing percentage of total flow | S | P1 |
| SK-5 | Minimum link width (prevent invisible thin links) | S | P2 |

**Click actions**:
- Current: ECharts click event forwarded.
- Proposed: Click on a node sets its name as parameter. Click on a link sets source + target.

**Rule-based styling**:
- Current: "Link Color" target.
- Proposed: Add "Node Color" target. Support node-level styling by name or value.

**Accessibility**:
- Proposed: `aria.label.description`: "Sankey diagram showing flow between {nodeCount} nodes via {linkCount} connections."

**Missing vs competitors**:
- Grafana: N/A
- Metabase: N/A
- Superset: Sankey with D3 (more customizable than ECharts)

**Files to modify**:
- `component/src/charts/sankey-chart.tsx`
- `component/src/components/composed/chart-options-schema.ts` (sankeyOptions)

---

### 14. Sunburst

**Current state -- what works well**:
- Hierarchical data rendering
- Sort order (desc/asc/none)
- Highlight on hover with ancestor focus
- Multi-level label configuration
- Rule-based styling for segment colors
- Responsive compact mode

**ECharts best practices not yet implemented**:
- Click-to-drill-down (click a segment to zoom into that subtree)
- `nodeClick: 'rootToNode'` for drill-down navigation
- Rich label formatting
- `downplay` for dimming non-focused segments

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| SB-1 | Click to drill down into subtree | M | P1 |
| SB-2 | Breadcrumb navigation (back button after drill-down) | M | P1 |
| SB-3 | Show percentage of parent in tooltip | S | P2 |
| SB-4 | Center text (show current root name) | S | P2 |

**Click actions**:
- Current: ECharts click event forwarded.
- Proposed: Dual behavior: single-click for cross-filter, double-click (or ctrl+click) for drill-down.

**Rule-based styling**:
- Current: "Segment Color" target (top-level only).
- Proposed: Recursive styling (apply color rules to children based on their own values).

**Accessibility**:
- Proposed: `aria.label.description`: "Sunburst chart with {levelCount} hierarchy levels."

**Missing vs competitors**:
- Grafana: N/A
- Metabase: N/A
- Superset: Sunburst with drill-down built-in

**Files to modify**:
- `component/src/charts/sunburst-chart.tsx`
- `component/src/components/composed/chart-options-schema.ts` (sunburstOptions)

---

### 15. Treemap

**Current state -- what works well**:
- Hierarchical data with breadcrumb navigation
- Show labels and values
- Color saturation gradient (low/medium/high)
- Upper labels for parent groups
- Multi-level styling
- Rule-based styling
- Responsive compact mode

**ECharts best practices not yet implemented**:
- `roam: 'move'` for panning inside treemap
- Click-to-drill (click to zoom into a child group)
- `visibleMin` to hide tiny rectangles
- Leaf label overflow handling

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| TM-1 | Click to drill into child group | M | P1 |
| TM-2 | Minimum visible size (hide tiny rectangles, show in tooltip) | S | P2 |
| TM-3 | Tooltip showing percentage of parent | S | P2 |
| TM-4 | Color by category (not just value gradient) | M | P2 |

**Click actions**:
- Current: ECharts click event forwarded.
- Proposed: Same as sunburst -- single-click for parameter, double-click for drill-down.

**Rule-based styling**:
- Current: "Block Color" target.
- Proposed: Add "Border Color" target. Support category-based coloring (different color per top-level group).

**Accessibility**:
- Proposed: `aria.label.description`: "Treemap showing {itemCount} items in {groupCount} groups."

**Missing vs competitors**:
- Grafana: N/A (no treemap)
- Metabase: N/A
- Superset: Treemap with drill-down, tooltip customization

**Files to modify**:
- `component/src/charts/treemap-chart.tsx`
- `component/src/components/composed/chart-options-schema.ts` (treemapOptions)

---

### 16. Form Widget

**Current state -- what works well**:
- Dynamic field generation from schema
- Text, number, date field types
- Submit button with loading state
- Success/error messages
- Reset on success option
- Write query execution

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| F-1 | Field validation (required, min/max, pattern) | M | P1 |
| F-2 | Select/dropdown field type (from hardcoded or query-sourced options) | M | P1 |
| F-3 | Textarea field type (multi-line text) | S | P2 |
| F-4 | Checkbox/toggle field type | S | P2 |
| F-5 | Confirmation dialog before submit | S | P2 |
| F-6 | Pre-fill from parameters (link form fields to dashboard parameters) | M | P2 |
| F-7 | Multi-step form (wizard style) | L | P3 |

**Click actions**: Not applicable (form submits, doesn't cross-filter).

**Rule-based styling**: Not applicable.

**Accessibility**:
- Current: Uses `<Label>` with `htmlFor`. Standard `<form>` semantics.
- Proposed: Add `aria-required` on required fields. Add `aria-invalid` on validation errors. Add `role="alert"` on error messages.

**Missing vs competitors**:
- Grafana: N/A (no forms)
- Metabase: Actions with forms (similar to NeoBoard's form widget)
- Superset: N/A

**Files to modify**:
- `component/src/components/composed/form-widget.tsx`
- `component/src/components/composed/chart-options-schema.ts` (formOptions)
- `app/src/components/form-widget-renderer.tsx`

---

### 17. Parameter Widgets

**Current state -- what works well**:
- ParamSelector: Single-select with search-as-you-type, clear button
- ParamMultiSelector: Multi-select with badges, search, clear
- CascadingSelector: Parent-dependent filtering
- DatePickerParameter: Calendar popup, ISO format
- DateRangeParameter: Dual calendar with presets (Today, Last 7 days, etc.)
- TextInputParameter: Free text with clear
- DateRelativePicker: Preset button row
- NumberRangeSlider: Dual-handle slider with numeric inputs

**UX improvements**:

| # | Improvement | Effort | Priority |
|---|-----------|--------|----------|
| PW-1 | Default value configuration (set initial value on dashboard load) | M | P1 |
| PW-2 | "Apply" button mode (batch parameter changes instead of immediate) | M | P2 |
| PW-3 | Parameter grouping/sections in the parameter bar | M | P3 |
| PW-4 | Autocomplete from recent values | M | P3 |
| PW-5 | Multi-select for CascadingSelector | M | P2 |
| PW-6 | Time picker (hour:minute, not just date) | M | P2 |
| PW-7 | Radio button group parameter type | S | P3 |
| PW-8 | Toggle (boolean) parameter type | S | P2 |

**Click actions**: Not applicable (parameters are the source, not the target of cross-filtering).

**Rule-based styling**: Not applicable.

**Accessibility**:
- Current: Proper `<Label>`, `aria-labelledby`, `aria-label` on clear buttons, `aria-pressed` on presets.
- Proposed: Add `aria-describedby` linking to help text. Ensure keyboard navigation works for all parameter types (test Tab/Enter/Space/Escape).

**Missing vs competitors**:
- Grafana: Variable with auto-refresh interval, "All" option, regex filtering, custom query variable
- Metabase: Dashboard filters with linked cards, location filter, ID filter
- Superset: Filter box with auto-apply, time grain selector, time range comparisons

**Files to modify**:
- `component/src/components/composed/parameter-widgets/*.tsx`
- `component/src/components/composed/chart-options-schema.ts` (parameterSelectOptions)
- `app/src/stores/parameter-store.ts`
- `app/src/components/parameter-widget-renderer.tsx`

---

## Testing Strategy

### Unit tests (Vitest)

| What to test | Package | Pattern |
|-------------|---------|---------|
| New chart-utils functions (tooltip formatter, empty data hints) | component/ | `component/src/charts/__tests__/chart-utils.test.ts` |
| DataZoom option propagation | component/ | `component/src/charts/__tests__/bar-chart.test.tsx` |
| Export utils (CSV generation) | app/ | `app/src/lib/__tests__/export-utils.test.ts` |
| New click action types (open-url, multi-parameter) | app/ | `app/src/lib/__tests__/resolve-click-action.test.ts` |
| New chart options schema entries | component/ | `component/src/components/composed/__tests__/chart-options-schema.test.ts` |
| Each new chart prop (referenceLines, connectNulls, etc.) | component/ | Per-chart test file |
| Parameter store default values | app/ | `app/src/stores/__tests__/parameter-store.test.ts` |

### E2E tests (Playwright)

| Scenario | Priority |
|----------|----------|
| DataZoom interaction on bar chart with many categories | P1 |
| Export PNG and CSV from widget card | P1 |
| Click action on gauge/single-value widget | P1 |
| Table cell conditional formatting | P1 |
| Treemap/sunburst drill-down navigation | P2 |
| Graph node property panel | P2 |
| Form validation errors | P1 |
| Parameter default values on dashboard load | P1 |

### Storybook stories

Each new feature should have a Storybook story demonstrating:
- Default state
- Configured state with the new feature enabled
- Edge cases (empty data, single data point, many data points)
- Responsive behavior at different sizes

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| ECharts bundle size increase from new components | High | Use tree-shaking (`import from 'echarts/core'`). Audit bundle after each feature. |
| NVL (graph) API changes break graph improvements | Medium | Pin NVL version. Add integration tests. |
| Leaflet plugin compatibility (heatmap, draw) | Medium | Test plugins in isolation before integrating. Use dynamic imports. |
| DataZoom interacts poorly with click actions | Low | Disable click action when dataZoom is active (detect zoom vs click). |
| Performance regression with large datasets | High | Add performance benchmarks. Test with 10,000+ rows for table and 5,000+ points for charts. |
| Breaking change to chart options schema | Medium | Use additive changes only. Never remove existing options. Default new options to preserve current behavior. |

---

## Suggested GitHub Issues

### Tier 1 -- High Priority (v0.9)

| # | Title | Labels | Size |
|---|-------|--------|------|
| 1 | feat(component): add DataZoom support for bar and line charts | `type:feature`, `pkg:component`, `area:charts` | M |
| 2 | feat(app): add CSV and PNG export to widget cards | `type:feature`, `pkg:app`, `pkg:component`, `area:widgets` | M |
| 3 | feat(component): add reference lines (markLine) for bar and line charts | `type:feature`, `pkg:component`, `area:charts` | M |
| 4 | feat(component): auto-rotate and truncate axis labels for bar chart | `type:feature`, `pkg:component`, `area:charts` | S |
| 5 | feat(component): add decimal places config to single value chart | `type:feature`, `pkg:component`, `area:charts` | S |
| 6 | feat(component): add donut center text and Top-N grouping for pie chart | `type:feature`, `pkg:component`, `area:charts` | M |
| 7 | feat(component): add column resizing to data grid | `type:feature`, `pkg:component`, `area:table` | M |
| 8 | feat(component): cell-level conditional formatting for data grid | `type:feature`, `pkg:component`, `area:table` | M |
| 9 | feat(component): add threshold zones to gauge chart | `type:feature`, `pkg:component`, `area:charts` | M |
| 10 | feat(component): add GFM table support to markdown widget | `type:feature`, `pkg:component`, `area:widgets` | M |

### Tier 2 -- Medium Priority (v0.10)

| # | Title | Labels | Size |
|---|-------|--------|------|
| 11 | feat(component): time-axis detection and formatting for line chart | `type:feature`, `pkg:component`, `area:charts` | M |
| 12 | feat(component): LTTB sampling for large line chart datasets | `type:feature`, `pkg:component`, `area:charts` | S |
| 13 | feat(component): connect nulls and end labels for line chart | `type:feature`, `pkg:component`, `area:charts` | S |
| 14 | feat(component): click-to-drill-down for sunburst and treemap | `type:feature`, `pkg:component`, `area:charts` | M |
| 15 | feat(component): node property panel for graph chart | `type:feature`, `pkg:component`, `area:charts` | M |
| 16 | feat(component): zoom controls and node count for graph chart | `type:feature`, `pkg:component`, `area:charts` | S |
| 17 | feat(component): field validation for form widget | `type:feature`, `pkg:component`, `area:widgets` | M |
| 18 | feat(component): select dropdown field type for form widget | `type:feature`, `pkg:component`, `area:widgets` | M |
| 19 | feat(app): enable click action for single-value and gauge widgets | `type:feature`, `pkg:app`, `area:widgets` | S |
| 20 | feat(component): marker color by value for map chart | `type:feature`, `pkg:component`, `area:charts` | S |
| 21 | feat(component): keyboard navigation and high-contrast mode | `type:feature`, `pkg:component`, `area:a11y` | M |
| 22 | feat(app): add open-url click action type | `type:feature`, `pkg:app`, `area:widgets` | S |
| 23 | feat(component): show values on Sankey links with percentage tooltip | `type:feature`, `pkg:component`, `area:charts` | S |
| 24 | feat(component): add default parameter values | `type:feature`, `pkg:app`, `area:params` | M |
| 25 | feat(component): comparison row for single value chart | `type:feature`, `pkg:component`, `area:charts` | M |

### Tier 3 -- Lower Priority (v0.11+)

| # | Title | Labels | Size |
|---|-------|--------|------|
| 26 | feat(component): dual Y-axis support for line chart | `type:feature`, `pkg:component`, `area:charts` | M |
| 27 | feat(component): sparkline for single value chart | `type:feature`, `pkg:component`, `area:charts` | L |
| 28 | feat(component): heatmap layer for map chart | `type:feature`, `pkg:component`, `area:charts` | M |
| 29 | feat(component): path highlighting for graph chart | `type:feature`, `pkg:component`, `area:charts` | L |
| 30 | feat(component): expandable rows for data grid | `type:feature`, `pkg:component`, `area:table` | L |
| 31 | feat(component): pivot table mode for data grid | `type:feature`, `pkg:component`, `area:table` | L |
| 32 | feat(component): multi-step form wizard | `type:feature`, `pkg:component`, `area:widgets` | L |
| 33 | feat(component): syntax highlighting for markdown code blocks | `type:feature`, `pkg:component`, `area:widgets` | M |
| 34 | feat(component): percentage stacked bar chart mode | `type:feature`, `pkg:component`, `area:charts` | S |
| 35 | feat(app): brush selection cross-filtering for bar and line | `type:feature`, `pkg:app`, `area:charts` | L |

---

## Appendix: Feature Comparison Matrix

| Feature | NeoBoard | Grafana | Metabase | Superset |
|---------|----------|---------|----------|----------|
| DataZoom / scroll | -- | Yes | -- | -- |
| Export CSV/PNG | -- | Yes (PNG) | Yes (CSV) | Yes (both) |
| Reference lines | -- | Yes | Yes (goal) | Yes |
| Threshold zones | -- | Yes | -- | -- |
| Annotations | -- | Yes | -- | Yes |
| Column resize (table) | -- | Yes | -- | -- |
| Cell heatmap (table) | -- | Yes | -- | Yes |
| Drill-down (hierarchy) | -- | -- | Yes | Yes |
| Cross-filter bus | Partial | -- | -- | Yes |
| Graph path highlight | -- | -- | -- | -- |
| Map heatmap layer | -- | Yes | -- | Yes |
| Form validation | -- | -- | -- | -- |
| Sparkline (single val) | -- | Yes | -- | Yes |
| Dual Y-axis | -- | Yes | -- | Yes |
| Brush selection | -- | Yes | -- | Yes |
| Keyboard nav (charts) | -- | -- | -- | -- |
| ARIA descriptions | Partial | -- | -- | -- |
| Decal patterns | Yes | -- | -- | -- |

Legend: Yes = implemented, Partial = partially implemented, -- = not implemented
