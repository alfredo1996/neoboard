# Task 1: Parameter Selectors & Cross-Chart Interactivity

> **Source**: NOTES.md item #1
> **Priority**: High — foundational feature for dashboard interactivity
> **Dependencies**: T2 (chart rendering) must be done — ✅ completed

---

## Problem Statement

NeoBoard currently has no interactivity between widgets. Clicking on a chart element does nothing. Users cannot filter or drill-down across widgets. There is no concept of "dashboard parameters" — scoped variables that can be set by user interactions and consumed by widget queries.

## Reference: How NeoDash Handles This

NeoDash implements a **parameter system** with two mechanisms:

### 1. Parameter Select Reports
- Dedicated widget types that expose a selector UI (dropdown, text input, date picker)
- Selected values stored as dashboard parameters with `$neodash_` prefix
- Other widgets reference these in Cypher: `MATCH (p:Person {name: $neodash_person_name})`

### 2. Report Actions
- Chart elements (table rows, graph nodes, bar segments, map markers) are clickable
- Clicking triggers configurable **actions**:
  - **Set Parameter** — clicking a bar sets `$neodash_movie_title` to that bar's label
  - **Open URL** — clicking a node opens a related URL
  - **Navigate Page** — clicking triggers navigation to another dashboard page
- This creates drill-down flows: select in chart A → filters chart B → click in chart B → filters chart C

### Industry Standard (Superset, Metabase, Grafana)
- **Superset**: Native cross-filtering — clicking a chart element automatically filters all charts sharing the same dataset/column. Uses a "cross-filter scoping" UI.
- **Metabase**: "Click behavior" on cards — click to filter, click to navigate, click to open URL. Parameters are scoped per dashboard.
- **Grafana**: Template variables with dropdowns, plus "data links" on chart elements for drill-down to other dashboards.

---

## Proposed Architecture for NeoBoard

### 1. Parameter Store (Zustand)

Create a new `parameter-store.ts`:

```typescript
// app/src/stores/parameter-store.ts
interface ParameterState {
  /** Map of parameterName → value */
  parameters: Record<string, unknown>;

  /** Set a single parameter (from chart click or selector) */
  setParameter: (name: string, value: unknown) => void;

  /** Delete a parameter (reset) */
  clearParameter: (name: string) => void;

  /** Clear all parameters */
  clearAll: () => void;
}
```

### 2. Parameter Naming Convention

Follow NeoDash convention with namespacing:
- `$param_<widget_title_snake>_<field>` — e.g., `$param_top_movies_title`
- Or simpler: user-defined parameter names in widget settings

### 3. Widget Settings Extension

Add to `DashboardWidget.settings`:
```typescript
settings: {
  // existing...
  title?: string;
  chartOptions?: Record<string, unknown>;

  // NEW: Parameter actions
  clickAction?: {
    type: 'set-parameter' | 'navigate' | 'open-url';
    /** For set-parameter: which field from the clicked data point maps to which parameter */
    parameterMapping?: {
      parameterName: string;
      /** The key from the data point to use as the value */
      sourceField: string;
    };
    /** For navigate: target page index */
    targetPage?: number;
    /** For open-url: URL template with {{field}} placeholders */
    urlTemplate?: string;
  };

  // NEW: Parameter consumption — query template substitution
  // The query field already supports this: just use $param_xxx in the query text
  // The query executor will substitute parameters before execution
}
```

### 4. Query Parameter Substitution

In `query-executor.ts` or the API route, before executing a query:
```typescript
function substituteParameters(query: string, params: Record<string, unknown>): string {
  let result = query;
  for (const [key, value] of Object.entries(params)) {
    // For Cypher: $param_name is already valid Neo4j parameter syntax
    // For SQL: replace $param_name with the value (parameterized)
    result = result.replace(new RegExp(`\\$${key}`, 'g'), formatValue(value));
  }
  return result;
}
```

Better approach: pass parameters through the existing `params` field of `DashboardWidget`, and the connection module handles them natively (Cypher uses `$name`, PostgreSQL uses `$1, $2...`).

### 5. Chart Click Handling

Each chart component needs an `onClick` callback:

```typescript
// In CardContainer/ChartRenderer:
<BarChart
  data={data}
  onDataPointClick={(point: { label: string; value: number; [key: string]: unknown }) => {
    if (widget.settings?.clickAction?.type === 'set-parameter') {
      const { parameterName, sourceField } = widget.settings.clickAction.parameterMapping;
      useParameterStore.getState().setParameter(parameterName, point[sourceField]);
    }
  }}
/>
```

**Required chart component changes** (in `component/` library):
- `BarChart`: Add `onBarClick` prop → fires with `{ label, value, seriesName, dataIndex }`
- `LineChart`: Add `onPointClick` prop → fires with `{ x, y, seriesName }`
- `PieChart`: Add `onSliceClick` prop → fires with `{ name, value }`
- `GraphChart`: Add `onNodeClick` / `onEdgeClick` props → fires with node/edge data
- `MapChart`: Add `onMarkerClick` prop → fires with marker data
- `DataGrid` (table): Add `onRowClick` prop → fires with full row data
- `SingleValueChart`: No click action (single value, nothing to select)
- `JsonViewer`: No click action

**ECharts** already supports click events via `echarts.bindevents` — the `BaseChart` component needs to forward an `onEvents` prop.

### 6. Parameter Bar UI

The component library already has `ParameterBar` and `CrossFilterTag` composed components. Use them:

```tsx
// In DashboardContainer or DashboardViewerPage:
<ParameterBar>
  {Object.entries(parameters).map(([name, value]) => (
    <CrossFilterTag
      key={name}
      label={name}
      value={String(value)}
      onRemove={() => clearParameter(name)}
    />
  ))}
</ParameterBar>
```

The `ParameterBar` should sit above the dashboard grid, showing active filters with dismiss (X) buttons.

### 7. Parameter Selector Widget Type

Add a new "widget type" that acts as an input selector rather than a chart:
- **Free Text**: Text input that sets a parameter
- **Dropdown**: Query-driven dropdown (runs a query, shows results as options)
- **Date Picker**: Sets a date parameter
- **Number Slider**: Sets a numeric range parameter

These would be a new `chartType: 'parameter-select'` in the registry with a special renderer.

### 8. Re-query on Parameter Change

When a parameter changes, all widgets whose queries reference that parameter need to re-execute:

```typescript
// In useWidgetQuery, include parameters in the query key:
const activeParams = useParameterStore((s) => s.parameters);
const relevantParams = filterRelevantParams(widget.query, activeParams);

return useQuery({
  queryKey: ['widget-query', widget.connectionId, widget.query, relevantParams],
  // ...
});
```

This leverages React Query's automatic refetch when the key changes.

---

## Implementation Order

1. **Phase 1**: Parameter store + parameter bar UI + manual parameter setting via URL or debug panel
2. **Phase 2**: Chart click handlers (add `onClick` props to chart components in `component/`)
3. **Phase 3**: Click action configuration in widget settings (UI in `WidgetEditorModal`)
4. **Phase 4**: Parameter selector widget type
5. **Phase 5**: Query parameter substitution + auto-refetch

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `app/src/stores/parameter-store.ts` | Create | Zustand store for dashboard parameters |
| `app/src/components/parameter-bar-container.tsx` | Create | Wires ParameterBar to the store |
| `app/src/components/dashboard-container.tsx` | Modify | Add parameter bar above grid, pass click handlers |
| `app/src/components/card-container.tsx` | Modify | Forward click events from charts to parameter store |
| `app/src/hooks/use-widget-query.ts` | Modify | Include parameters in query key for auto-refetch |
| `app/src/lib/query-executor.ts` | Modify | Handle parameter substitution |
| `app/src/components/widget-editor-modal.tsx` | Modify | Add click action configuration UI |
| `component/src/charts/base-chart.tsx` | Modify | Add `onEvents` prop forwarding |
| `component/src/charts/bar-chart.tsx` | Modify | Add `onBarClick` prop |
| `component/src/charts/line-chart.tsx` | Modify | Add `onPointClick` prop |
| `component/src/charts/pie-chart.tsx` | Modify | Add `onSliceClick` prop |
| `component/src/charts/graph-chart.tsx` | Modify | Add `onNodeClick` prop |
| `component/src/charts/map-chart.tsx` | Modify | Add `onMarkerClick` prop |
| `app/src/lib/chart-registry.ts` | Modify | Add `parameter-select` type |

---

## Data Model Impact

The `DashboardWidget.settings` field (already `Record<string, unknown>`) absorbs the new `clickAction` configuration — no DB schema change needed.

The `DashboardLayout` interface may need a `parameters` section for persisted default parameter values:
```typescript
interface DashboardLayout {
  widgets: DashboardWidget[];
  gridLayout: GridLayoutItem[];
  parameters?: Record<string, unknown>; // NEW: saved default parameter values
}
```

---

## Acceptance Criteria

- [ ] Clicking a bar/slice/node/row sets a parameter visible in the parameter bar
- [ ] Parameter bar shows active filters with remove buttons
- [ ] Removing a parameter re-queries affected widgets
- [ ] Parameters can be configured per-widget in the editor modal
- [ ] Parameter selector widget type works (dropdown driven by a query)
- [ ] Parameters persist during the session (not across page refreshes by default)
- [ ] Parameters can optionally be saved with the dashboard layout
