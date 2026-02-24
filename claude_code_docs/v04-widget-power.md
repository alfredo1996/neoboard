# v0.4 — Widget Power Architecture Guide

Reference doc for implementing the 9 issues in the v0.4 milestone. Read this before working on any v0.4 issue.

---

## Chart System Architecture

### Chart Registry (`app/src/lib/chart-registry.ts`)

Single source of truth for all chart types. Maps `ChartType` → `{ label, transform }`.

**Data flow**: Query API → `toRecords()` normalizer → chart-specific `transform()` → chart component props.

```
User query → API /query → raw result → toRecords() → [{ key: value }]
                                                        ↓
                                           chartRegistry[type].transform()
                                                        ↓
                                              Chart component props
```

**Adding to the registry**: When adding new fields (e.g. `compatibleConnectors` for #12), extend the `ChartConfig` interface. Don't break existing entries — make new fields optional with sensible defaults.

### Chart Options (`component/src/components/composed/chart-options-schema.ts`)

Schema-driven options system. Each chart type has an array of `ChartOptionDef` with:
- `key` — stored in `widget.settings.chartOptions[key]`
- `type` — determines UI control (`boolean` → switch, `select` → dropdown, `text` → input, `number` → number input)
- `category` — groups options into collapsible sections
- `default` — fallback value

**Extending options (#20)**: Add new entries to the per-chart arrays. If you need a new control type (e.g. `color`, `slider`), extend the `ChartOptionDef.type` union AND update `chart-options-panel.tsx` to render it.

### Chart Components (`component/src/charts/`)

Pure presentational. Props-driven. NO API calls, NO stores, NO imports from app/.

- ECharts-based: `bar-chart.tsx`, `line-chart.tsx`, `pie-chart.tsx` — all extend `BaseChart`
- Special: `graph-chart.tsx` (NVL), `map-chart.tsx` (Leaflet), `single-value-chart.tsx` (HTML/CSS)
- Container-aware: use `useContainerSize()` hook for responsive behavior

**Pattern**: Chart reads `chartOptions` from props, applies them to ECharts option object in `useMemo`.

---

## Widget Editor Flow (`app/src/components/widget-editor-modal.tsx`)

Two-step modal:
1. **Step 1**: Pick chart type + connection
2. **Step 2**: Configure query, preview results, set chart options, click actions

The editor stores widget config as:
```typescript
{
  type: ChartType,
  connectionId: string,
  query: string,
  settings: {
    chartOptions: Record<string, unknown>,  // From chart-options-schema
    columnMapping?: Record<string, string>, // For #15
    clickAction?: ClickAction,
  }
}
```

---

## Parameter System (`app/src/stores/parameter-store.ts`)

### Current State
- Zustand store with `Record<string, ParameterEntry>`
- Parameters set via click-actions on charts
- `useParameterValues()` returns `{ name: value }` for query substitution
- `useWidgetQuery` hook extracts `$param_xxx` references from queries

### Extension Points for #10
- The `ParameterEntry` type needs a `source` field that can distinguish between click-action and selector-widget origins
- Parameter substitution in `use-widget-query.ts` already handles `$param_xxx` → positional `$1, $2` for PostgreSQL
- Reactive re-query: widgets already re-render when parameter values change (Zustand subscription)
- For cascading selectors: the selector widget's own seed query must also react to parameter changes

### Parameter Bar (`component/src/components/composed/parameter-bar.tsx`)
Currently shows active parameters as dismissible tags. For #10, this needs to become the container for inline parameter widgets rendered above the dashboard grid.

---

## Connection System

### Connector Types
- `neo4j` — Cypher queries, graph results, labels/relationships schema
- `postgresql` — SQL queries, tabular results, tables/columns schema

### Schema Store (`app/src/stores/schema-store.ts`)
Caches introspected schema per connection. Used for:
- CodeMirror autocompletion (#14)
- Schema browser sidebar (#14)
- Field picker in column mapping (#15)
- Connector-first chart affinity (#12)

### Schema Types (`connection/src/schema/types.ts`)
```typescript
interface Schema {
  labels?: string[];           // Neo4j node labels
  relationshipTypes?: string[]; // Neo4j relationship types
  tables?: TableSchema[];       // PostgreSQL tables
}
interface TableSchema {
  name: string;
  schema: string;
  columns: ColumnSchema[];
}
```

---

## Key Patterns

### Dynamic Loading (Charts & Widgets)
All chart components MUST use `next/dynamic` with `ssr: false`. This is enforced in `card-container.tsx`.

### Container Size Awareness
Charts use `useContainerSize()` hook for responsive behavior. The `card-container.tsx` wrapper provides container dimensions.

### Data Grid (Table Widget)
`component/src/components/composed/data-grid.tsx` — TanStack Table v8 wrapper. For #16, dynamic pagination should calculate page size from container height.

### Field Picker
`component/src/components/composed/field-picker.tsx` — existing component for selecting fields with type badges. Reuse for column mapping (#15).

---

## Issue Dependencies

```
#17 (chart config analysis) → #20 (implement chart options)
#14 (CodeMirror) — depends on schema store (already exists)
#12 (connector-first) — depends on schema store (already exists)
#10 (parameters) — extends existing parameter store
#15 (column mapping) — extends chart registry transforms
#16 (table pagination) — extends data-grid component
#29 (keyboard shortcut) — extends widget-editor-modal
#30 (duplicate widget) — extends dashboard-store
```

---

## Enterprise Extensibility Hooks

When implementing v0.4 issues, leave these extension points:

1. **Parameter store (#10)**: Use a `ParameterSource` type union (`'click-action' | 'selector' | 'url' | 'cross-dashboard'`) — enterprise adds URL and cross-dashboard sources
2. **CodeMirror (#14)**: Accept a `SchemaProvider` interface for autocompletion — enterprise adds cached schema and alias resolution
3. **Chart options (#20)**: Keep the schema-driven model — enterprise rule-based styling (#33) just extends the schema
4. **Connector selector (#12)**: Accept a filter predicate — enterprise connector labels (#39) and aliases (#44) filter the list
5. **Query execution**: The existing `useWidgetQuery` hook is the right extension point for enterprise caching (#42)
