# NeoBoard Plugin Ecosystem

NeoBoard's plugin system lets you extend the platform with custom chart types and database connectors. Plugins are npm packages that integrate seamlessly via the CLI.

## Built-in Charts (20)

| Chart Type       | Description                                      | Data Sources      |
| ---------------- | ------------------------------------------------ | ----------------- |
| Bar              | Vertical/horizontal bars for category comparison | Neo4j, PostgreSQL |
| Line             | Trend lines and time series                      | Neo4j, PostgreSQL |
| Pie              | Proportional slices (pie/doughnut)               | Neo4j, PostgreSQL |
| Table            | Sortable, filterable data grid                   | Neo4j, PostgreSQL |
| Single Value     | KPI card with optional trend                     | Neo4j, PostgreSQL |
| Gauge            | Semicircular dial for thresholds                 | Neo4j, PostgreSQL |
| Graph            | Interactive node-relationship visualization      | Neo4j             |
| Map              | Geographic markers on Leaflet                    | Neo4j, PostgreSQL |
| Sankey           | Weighted flow diagrams                           | Neo4j, PostgreSQL |
| Sunburst         | Multi-level hierarchical drill-down              | Neo4j, PostgreSQL |
| Radar            | Multi-dimensional comparison                     | Neo4j, PostgreSQL |
| Treemap          | Nested rectangles for hierarchy                  | Neo4j, PostgreSQL |
| Gantt            | Timeline bars for scheduling                     | Neo4j, PostgreSQL |
| Circle Packing   | Nested circles for containment                   | Neo4j, PostgreSQL |
| Choropleth       | Geographic heatmap by region                     | Neo4j, PostgreSQL |
| JSON Viewer      | Collapsible JSON tree                            | Neo4j, PostgreSQL |
| Form             | Input fields executing write queries             | Neo4j, PostgreSQL |
| Markdown         | Static rich text (no query)                      | N/A               |
| iFrame           | Embedded external pages                          | N/A               |
| Parameter Select | Dropdowns/pickers feeding parameters             | Neo4j, PostgreSQL |

## Built-in Connectors

| Connector  | Protocols                     | Query Language |
| ---------- | ----------------------------- | -------------- |
| Neo4j      | bolt://, neo4j://, neo4j+s:// | Cypher         |
| PostgreSQL | postgresql://                 | SQL            |

## Community Connectors

| Name    | Author    | Install                                          | Status     |
| ------- | --------- | ------------------------------------------------ | ---------- |
| MongoDB | @neoboard | `neoboard plugin add neoboard-connector-mongodb` | 📘 Example |

> Want to add yours? See [Publishing Your Plugin](#publishing-your-plugin) below.

## Community Charts

| Name | Author | Install | Status |
| ---- | ------ | ------- | ------ |
|      |        |         |        |

> Be the first! Follow the [Plugin Authoring Guide](docs/plugins/authoring.md) to get started.

## Publishing Your Plugin

1. **Build** — Follow the [Plugin Authoring Guide](docs/plugins/authoring.md)
2. **Name** — Use prefix `neoboard-chart-*` or `neoboard-connector-*`
3. **Publish** — `npm publish` to the npm registry
4. **Register** — Submit a PR adding your plugin to this file

### Naming conventions

- Chart plugins: `neoboard-chart-{name}` (e.g., `neoboard-chart-sparkline`)
- Connector plugins: `neoboard-connector-{name}` (e.g., `neoboard-connector-mongodb`)

### Status badges

- 🟢 **Maintained** — Actively maintained, compatible with latest NeoBoard
- 🟡 **Experimental** — Working but may have rough edges
- 🔴 **Archived** — No longer maintained

## Plugin Compatibility

All plugins target NeoBoard v2.0+. Check individual plugin READMEs for specific version requirements.
