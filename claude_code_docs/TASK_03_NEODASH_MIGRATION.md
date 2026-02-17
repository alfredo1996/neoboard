# Task 3: NeoDash Migration Analysis — Feature Gap & Roadmap

> **Source**: NOTES.md item #3
> **Priority**: Strategic — defines the long-term product direction
> **Dependencies**: Understanding of current NeoBoard state

---

## Objective

Compare NeoBoard's current feature set against NeoDash (both open-source and commercial) to identify:
1. What features we're missing
2. What features we already have that NeoDash doesn't
3. What's redundant or unnecessary
4. A migration path for existing NeoDash dashboards

---

## NeoDash Feature Inventory

### Chart Types

| Chart Type | NeoDash OSS | NeoDash Commercial | NeoBoard | Status |
|------------|:-----------:|:-----------------:|:--------:|--------|
| Bar Chart | ✅ | ✅ | ✅ | Parity |
| Line Chart | ✅ | ✅ | ✅ | Parity |
| Pie Chart | ✅ | ✅ | ✅ | Parity |
| Table | ✅ | ✅ | ✅ | Parity |
| Graph Visualization | ✅ | ✅ | ✅ | Parity |
| Map (markers) | ✅ | ✅ | ✅ | Parity |
| Single Value (KPI) | ✅ | ✅ | ✅ | Parity |
| iFrame | ✅ | ✅ | ❌ | **Missing** |
| Markdown / Rich Text | ✅ | ✅ | ❌ | **Missing** |
| Parameter Select | ✅ | ✅ | ❌ | **Missing** — covered in TASK_01 |
| JSON Viewer | ❌ | ❌ | ✅ | **NeoBoard advantage** |
| Gauge | ❌ | ✅ | ❌ | Missing (commercial) |
| Sunburst | ❌ | ✅ | ❌ | Missing (commercial) |
| Sankey | ❌ | ✅ | ❌ | Missing (commercial) |
| Choropleth Map | ❌ | ✅ | ❌ | Missing (commercial) |
| Treemap | ❌ | ✅ | ❌ | Missing (commercial) |
| Radar | ❌ | ✅ | ❌ | Missing (commercial) |
| Area Chart | ❌ | ✅ | ✅* | *LineChart has `area` option |

### Interactivity

| Feature | NeoDash OSS | NeoDash Commercial | NeoBoard | Status |
|---------|:-----------:|:-----------------:|:--------:|--------|
| Parameter Selectors | ✅ | ✅ | ❌ | **Missing** — TASK_01 |
| Report Actions (click→param) | ✅ | ✅ | ❌ | **Missing** — TASK_01 |
| Cross-filtering | ❌ | ✅ | ❌ | Missing |
| Drill-down navigation | ✅ | ✅ | ❌ | **Missing** |
| Auto-refresh | ❌ | ✅ | ❌ | Missing |
| Rule-based styling | ❌ | ✅ | ❌ | Missing |

### Dashboard Features

| Feature | NeoDash OSS | NeoDash Commercial | NeoBoard | Status |
|---------|:-----------:|:-----------------:|:--------:|--------|
| Multiple pages/tabs | ✅ | ✅ | ❌ | **Missing** — TASK_10 in NOTES |
| Drag & resize grid | ✅ | ✅ | ✅ | Parity |
| Dashboard sharing | ✅ | ✅ | ✅ | Parity |
| Role-based access | ❌ | ✅ | ✅* | *Basic (owner/editor/viewer) |
| Export/Import JSON | ✅ | ✅ | ❌ | **Missing** — TASK_08 in NOTES |
| Dashboard metadata | ❌ | ✅ | ❌ | **Missing** — TASK_07 in NOTES |
| Fullscreen view | ❌ | ✅ | ✅ | Parity |
| Public dashboards | ✅ | ✅ | ✅* | *Field exists, not exposed in UI |

### Data Sources

| Feature | NeoDash | NeoBoard | Status |
|---------|:-------:|:--------:|--------|
| Neo4j | ✅ | ✅ | Parity |
| PostgreSQL | ❌ | ✅ | **NeoBoard advantage** |
| Multiple connections | ❌ | ✅ | **NeoBoard advantage** — NeoDash is single-connection |
| Schema browsing | ✅ | ❌ | **Missing** — TASK_02 |

### Authentication

| Feature | NeoDash | NeoBoard | Status |
|---------|:-------:|:--------:|--------|
| Neo4j SSO | ✅ | ❌ | Missing (not critical) |
| Username/Password | ✅ | ✅ | Parity |
| User management | ❌ | ✅ | **NeoBoard advantage** |

---

## NeoBoard Advantages Over NeoDash

1. **Multi-database support** — PostgreSQL + Neo4j in the same dashboard
2. **Multi-connection per dashboard** — different widgets can query different databases
3. **Modern tech stack** — Next.js 15, React 19, shadcn/ui, Tailwind
4. **User management** — built-in user CRUD
5. **Component library** — 88+ tested, documented components with Storybook
6. **JSON Viewer** — structured data exploration (NeoDash doesn't have this)
7. **Chart options panel** — per-chart-type configuration without editing JSON
8. **Widget editor with live preview** — NeoDash requires switching between edit/view modes

---

## Priority Features to Reach Parity

### Must-Have (before calling this a NeoDash replacement)

1. **Parameter Selectors & Report Actions** → TASK_01
2. **Dashboard Pages/Tabs** → TASK_10 (NOTES #10)
3. **Export/Import Dashboards** → TASK_08 (NOTES #8)
4. **Markdown Widget** — static text/instructions within dashboards
5. **iFrame Widget** — embed external content (simple: render an iframe with a URL from query/settings)

### Should-Have (competitive advantage)

6. **Code Editor with Syntax Highlighting** → TASK_02
7. **Schema Browsing** → TASK_02
8. **Auto-refresh** — periodic query re-execution (e.g., every 30s)
9. **Dashboard Metadata** → TASK_07 (NOTES #7)
10. **Connector Error Visibility** → TASK_09 (NOTES #9)

### Nice-to-Have (commercial NeoDash features)

11. **Gauge Chart** — ECharts supports this natively, easy to add
12. **Sankey Chart** — ECharts supports this
13. **Sunburst Chart** — ECharts supports this
14. **Radar Chart** — ECharts supports this
15. **Treemap** — ECharts supports this
16. **Choropleth Map** — needs GeoJSON, more complex
17. **Rule-based Styling** — conditional formatting based on data values

---

## NeoDash Dashboard Migration Path

### Dashboard JSON Format Comparison

NeoDash stores dashboards as JSON with this structure:
```json
{
  "title": "My Dashboard",
  "version": "2.4",
  "settings": { ... },
  "pages": [
    {
      "title": "Page 1",
      "reports": [
        {
          "id": "abc123",
          "title": "Movie Count",
          "query": "MATCH (m:Movie) RETURN count(m) AS count",
          "type": "value",  // ← chart type
          "x": 0, "y": 0, "width": 4, "height": 2,
          "settings": { ... }
        }
      ]
    }
  ]
}
```

NeoBoard stores dashboards as:
```json
{
  "widgets": [
    {
      "id": "w1",
      "chartType": "single-value",
      "connectionId": "conn-001",
      "query": "MATCH (m:Movie) RETURN count(m) AS count",
      "settings": { "title": "Movie Count" }
    }
  ],
  "gridLayout": [
    { "i": "w1", "x": 0, "y": 0, "w": 4, "h": 2 }
  ]
}
```

### Migration Converter

Create a utility function:
```typescript
function convertNeoDashToNeoBoard(
  neodashJson: NeoDashDashboard,
  connectionId: string  // user must provide since NeoDash is single-connection
): DashboardLayout
```

**Type mapping**:
| NeoDash `type` | NeoBoard `chartType` |
|---------------|---------------------|
| `bar` | `bar` |
| `line` | `line` |
| `pie` | `pie` |
| `table` | `table` |
| `graph` | `graph` |
| `map` | `map` |
| `value` | `single-value` |
| `iframe` | `iframe` (once implemented) |
| `markdown` | `markdown` (once implemented) |
| `select` | `parameter-select` (once implemented) |

**Layout mapping**: NeoDash uses `x, y, width, height` → NeoBoard uses `x, y, w, h` (just rename).

This converter can be part of the export/import feature (TASK_08).

---

## Recommended Implementation Sequence

1. Parameter Selectors (TASK_01) — foundational
2. Dashboard Pages (NOTES #10) — structural
3. Export/Import with NeoDash converter (NOTES #8) — migration enabler
4. Markdown + iFrame widgets — low-effort, high-value
5. Additional chart types (Gauge, Sankey, etc.) — ECharts-based, moderate effort
6. Auto-refresh — moderate effort

---

## Acceptance Criteria

- [ ] Feature gap analysis document produced (this document)
- [ ] Priority features identified and ordered
- [ ] NeoDash JSON format documented for migration
- [ ] Type mapping table complete
- [ ] Conversion utility spec defined
