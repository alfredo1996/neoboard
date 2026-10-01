# NeoBoard Plugin Ecosystem

NeoBoard's plugin system lets you extend the platform with custom chart types and database connectors. Plugins are npm packages compiled into a NeoBoard build from source: install the package in a checkout, list it in `neoboard-plugins.json` (charts) or `neoboard-connectors.json` (connectors), and build.

## Built-in Charts (18)

These are the 18 chart plugins NeoBoard registers. The widget picker offers 16 of them: Radar and Choropleth stay registered so dashboards that already use them keep rendering, but the picker does not list them, so they cannot be added to new widgets.

A chart is offered on a connection by what its connector declares, never by which connector it is: the Graph chart needs `supportsGraphData`, the Form widget needs `supportsWrite`, and every other chart works on any connector.

| Chart Type       | Description                                                  | Offered on                           |
| ---------------- | ------------------------------------------------------------ | ------------------------------------ |
| Bar              | Vertical/horizontal bars for category comparison             | Any connector                        |
| Line             | Trend lines and time series                                  | Any connector                        |
| Pie              | Proportional slices (pie/doughnut)                           | Any connector                        |
| Table            | Sortable, filterable data grid                               | Any connector                        |
| Single Value     | KPI card with optional trend                                 | Any connector                        |
| Gauge            | Semicircular dial for thresholds                             | Any connector                        |
| Graph            | Interactive node-relationship visualization                  | A connector with `supportsGraphData` |
| Map              | Geographic markers on Leaflet                                | Any connector                        |
| Sankey           | Weighted flow diagrams                                       | Any connector                        |
| Sunburst         | Multi-level hierarchical drill-down                          | Any connector                        |
| Radar            | Multi-dimensional comparison — hidden from the widget picker | Any connector                        |
| Gantt            | Timeline bars for scheduling                                 | Any connector                        |
| Choropleth       | Geographic heatmap by region — hidden from the widget picker | Any connector                        |
| JSON Viewer      | Collapsible JSON tree                                        | Any connector                        |
| Form             | Input fields executing write queries                         | A connector with `supportsWrite`     |
| Markdown         | Static rich text (no query)                                  | Any (no query)                       |
| iFrame           | Embedded external pages                                      | Any (no query)                       |
| Parameter Select | Dropdowns/pickers feeding parameters                         | Any connector                        |

## Built-in Connectors

| Connector  | Protocols                     | Query Language |
| ---------- | ----------------------------- | -------------- |
| Neo4j      | bolt://, neo4j://, neo4j+s:// | Cypher         |
| PostgreSQL | postgresql://                 | SQL            |

## Community Connectors

| Name    | Author | Install                                                                          | Status     |
| ------- | ------ | -------------------------------------------------------------------------------- | ---------- |
| MongoDB | —      | Not published yet — [#1702](https://github.com/alfredo1996/neoboard/issues/1702) | 🔵 Planned |

> Want to add yours? See [Publishing Your Plugin](#publishing-your-plugin) below.

## Community Charts

| Name | Author | Install | Status |
| ---- | ------ | ------- | ------ |
|      |        |         |        |

> Be the first! Follow the [chart plugin guide](https://alfredo1996.github.io/neoboard/extend/new-chart-plugin/) to get started.

## Publishing Your Plugin

1. **Build** — Follow the [connector plugin guide](https://alfredo1996.github.io/neoboard/extend/new-connector-plugin/)
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
- 🔵 **Planned** — Tracked in an issue; no package to install yet

## Plugin Compatibility

All plugins target NeoBoard 1.x. Check individual plugin READMEs for specific version requirements.
