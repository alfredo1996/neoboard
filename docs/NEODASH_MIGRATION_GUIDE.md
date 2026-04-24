# Migrating from NeoDash to NeoBoard

This guide covers how to import your existing NeoDash dashboards into NeoBoard, what gets converted automatically, and what needs manual adjustment.

> **Note:** NeoDash (Labs) is [no longer maintained](https://github.com/neo4j-labs/neodash) by Neo4j. NeoBoard is a fully open-source alternative with support for both Neo4j and PostgreSQL.

---

## Quick Start

1. **Export** your NeoDash dashboard as a JSON file (from the NeoDash sidebar)
2. Open NeoBoard and click **Import** on the dashboards page
3. Select the JSON file - NeoBoard auto-detects the NeoDash format
4. Click **Import** - your dashboard is created with all pages and widgets

That's it. No configuration needed. NeoBoard converts the dashboard structure, queries, parameters, and chart types automatically.

---

## What Gets Converted

### Dashboard Structure

| Feature                             | Conversion                                                         |
| ----------------------------------- | ------------------------------------------------------------------ |
| Dashboard title                     | Preserved                                                          |
| Multi-page dashboards               | All pages preserved with their titles                              |
| Widget grid layout (position, size) | Mapped to NeoBoard's react-grid-layout                             |
| Cypher queries                      | Copied verbatim                                                    |
| Parameter syntax                    | `$neodash_paramName` automatically converted to `$param_paramName` |

### Chart Type Mapping (19 of 22 types)

| NeoDash Type       | NeoBoard Type    | Notes                                               |
| ------------------ | ---------------- | --------------------------------------------------- |
| Table              | Table            | Direct mapping                                      |
| Graph              | Graph            | 2D graph via Neo4j NVL                              |
| Bar Chart          | Bar              | Direct mapping                                      |
| Line Chart         | Line             | Direct mapping                                      |
| Pie Chart          | Pie              | Direct mapping                                      |
| Area Chart         | Line             | Imported as line chart with area fill enabled       |
| Map                | Map              | Leaflet-based point markers                         |
| Single Value       | Single Value     | Direct mapping                                      |
| Gauge              | Gauge            | Minimal arc style                                   |
| Sunburst           | Sunburst         | Direct mapping                                      |
| Treemap            | Treemap          | Direct mapping                                      |
| Sankey             | Sankey           | Direct mapping                                      |
| Radar              | Radar            | Direct mapping                                      |
| Gantt              | Gantt            | Timeline bars on time axis                          |
| Parameter Select   | Parameter Select | Direct mapping                                      |
| Form               | Form             | Direct mapping                                      |
| Markdown           | Markdown         | Direct mapping                                      |
| Raw JSON           | JSON Viewer      | Direct mapping                                      |
| iFrame             | iFrame           | Direct mapping                                      |
| **3D Graph**       | Graph (2D)       | Converted to 2D graph - 3D view is lost             |
| **Circle Packing** | Sunburst         | Same data, different visual representation          |
| **Choropleth**     | JSON Viewer      | No region-fill map in NeoBoard (uses point markers) |

### What Requires Manual Setup After Import

1. **Database connections** - NeoDash stores connection info inside the dashboard JSON, but NeoBoard manages connections separately. After import, you need to:
   - Create a Neo4j connection in NeoBoard (Connections page)
   - Open each widget and select the correct connection

2. **Widget titles** - NeoDash report titles are not yet mapped to NeoBoard widget titles. You may need to re-add titles to widgets.

---

## Feature Comparison

### Visualization Features

| Feature                          | NeoDash | NeoBoard | Notes                       |
| -------------------------------- | ------- | -------- | --------------------------- |
| Bar, Line, Pie charts            | Yes     | Yes      | Full parity                 |
| Graph visualization              | 2D + 3D | 2D only  | Neo4j NVL for 2D            |
| Map (point markers)              | Yes     | Yes      | Leaflet-based               |
| Choropleth (region fill)         | Yes     | No       | NeoBoard uses point markers |
| Gantt chart                      | Yes     | Yes      | ECharts custom series       |
| Gauge chart                      | Yes     | Yes      | Minimal arc design          |
| Hierarchical (Sunburst, Treemap) | Yes     | Yes      | Full parity                 |
| Sankey, Radar                    | Yes     | Yes      | Full parity                 |
| Circle Packing                   | Yes     | No       | Use Sunburst as alternative |
| Table with checklist             | Yes     | No       | Standard table only         |
| Single Value                     | Yes     | Yes      | Full parity                 |
| Markdown                         | Yes     | Yes      | Full parity                 |
| iFrame                           | Yes     | Yes      | Full parity                 |
| Form (write queries)             | Yes     | Yes      | Full parity                 |
| Parameter Select                 | Yes     | Yes      | Full parity                 |

### Data Sources

| Feature                            | NeoDash           | NeoBoard    |
| ---------------------------------- | ----------------- | ----------- |
| Neo4j (Cypher)                     | Yes               | Yes         |
| PostgreSQL (SQL)                   | No                | Yes         |
| Multiple connections per dashboard | No (single Neo4j) | Yes         |
| Connection encryption              | No                | AES-256-GCM |

### Dashboard Features

| Feature                             | NeoDash           | NeoBoard                         |
| ----------------------------------- | ----------------- | -------------------------------- |
| Multi-page dashboards               | Yes               | Yes                              |
| Dashboard import/export (JSON)      | Yes               | Yes                              |
| Parameter widgets                   | Yes               | Yes                              |
| Cascading parameters                | Limited           | Yes (parent-child dependencies)  |
| Click actions (navigate, set param) | Yes               | Yes                              |
| Rule-based styling                  | Yes               | Yes                              |
| Auto-refresh                        | Yes               | Yes (per-widget)                 |
| Dark mode                           | Experimental      | Full support                     |
| Dashboard sharing                   | Via Neo4j storage | Per-user permissions (view/edit) |

### Enterprise Features (NeoBoard only)

| Feature                         | NeoDash         | NeoBoard                        |
| ------------------------------- | --------------- | ------------------------------- |
| Multi-tenancy                   | No              | Yes (tenant_id isolation)       |
| User management (RBAC)          | Via Neo4j roles | Built-in (admin/creator/reader) |
| API key access                  | No              | Yes (programmatic API)          |
| Query scheduling & backpressure | No              | Yes (priority queue)            |
| Audit logging                   | No              | Yes (query + auth events)       |
| Credential encryption           | No              | AES-256-GCM                     |
| OpenAPI documentation           | No              | Yes                             |

---

## Not Supported (Architecture Differences)

These NeoDash features cannot be migrated due to fundamental architectural differences:

| NeoDash Feature               | Why                                                                 | Workaround                                                    |
| ----------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| **3D Graph**                  | NeoBoard uses Neo4j NVL (2D). No WebGL 3D renderer.                 | Data preserved as 2D graph.                                   |
| **Choropleth / Area Map**     | NeoBoard's map uses Leaflet point markers, not GeoJSON region fill. | Use the map widget with lat/lng data, or view as JSON.        |
| **Circle Packing**            | No ECharts circle packing chart type.                               | Automatically converted to Sunburst (same hierarchical data). |
| **Text2Cypher**               | NeoBoard has no LLM integration for natural language queries.       | Write Cypher queries directly.                                |
| **Bloom Deep Links**          | NeoBoard has no Neo4j Bloom integration.                            | Links preserved as text but non-functional.                   |
| **Dashboard stored in Neo4j** | NeoBoard stores dashboards in PostgreSQL.                           | One-time import; no ongoing sync with Neo4j.                  |
| **Table Checklist mode**      | NeoBoard table doesn't support interactive checkboxes.              | Standard table with sorting/filtering.                        |

---

## Example: Importing a NeoDash Dashboard

### NeoDash JSON Structure

```json
{
  "title": "Movie Explorer",
  "version": "2.4",
  "pages": [
    {
      "title": "Overview",
      "reports": [
        {
          "title": "Movie Count",
          "type": "value",
          "query": "MATCH (m:Movie) RETURN count(m) AS value",
          "x": 0,
          "y": 0,
          "width": 3,
          "height": 2
        },
        {
          "title": "Movies by Year",
          "type": "bar",
          "query": "MATCH (m:Movie) RETURN m.released AS category, count(*) AS value ORDER BY category",
          "x": 3,
          "y": 0,
          "width": 9,
          "height": 4
        },
        {
          "title": "Cast Network",
          "type": "graph",
          "query": "MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) RETURN p, r, m LIMIT 50",
          "x": 0,
          "y": 4,
          "width": 12,
          "height": 6
        }
      ]
    }
  ]
}
```

### What NeoBoard Creates

After import, NeoBoard creates a dashboard with:

- **Page "Overview"** with 3 widgets
- **Movie Count** → Single Value widget (type `value` → `single-value`)
- **Movies by Year** → Bar chart widget
- **Cast Network** → Graph widget (Neo4j NVL)
- Grid positions preserved: each widget at its original x/y/width/height
- Parameter syntax converted: `$neodash_*` → `$param_*`
- All queries copied verbatim — ready to run once you assign a connection

### After Import Checklist

1. Go to **Connections** and create your Neo4j connection
2. Open each widget (edit mode) and select the connection
3. Optionally re-add widget titles
4. Save the dashboard

---

## Frequently Asked Questions

**Q: Can I import NeoDash dashboards from any version?**
A: The importer accepts any NeoDash JSON with the `pages[].reports[]` structure (NeoDash 2.x). NeoDash 1.x format is not supported.

**Q: What happens to chart types NeoBoard doesn't support?**
A: Unsupported types (3D Graph, Circle Packing, Choropleth) are converted to the closest equivalent or fall back to a JSON viewer. Your data and queries are preserved.

**Q: Can I go back to NeoDash after importing?**
A: NeoBoard export format is different from NeoDash. The import is one-way. Keep your original NeoDash JSON as a backup.

**Q: Do I need to change my Cypher queries?**
A: No. Queries are imported verbatim. The only change is parameter syntax (`$neodash_` → `$param_`), which is handled automatically.

**Q: Can I import dashboards that use PostgreSQL?**
A: NeoDash only supports Neo4j, so imported dashboards will have Cypher queries. You can manually add PostgreSQL widgets after import.
