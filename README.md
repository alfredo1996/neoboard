<p align="center">
  <h1 align="center">NeoBoard</h1>
  <p align="center">
    Open-source dashboards for Neo4j + PostgreSQL
    <br />
    <em>The modern alternative to NeoDash</em>
  </p>
  <p align="center">
    <a href="https://github.com/alfredo1996/neoboard/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/alfredo1996/neoboard/actions/workflows/ci.yml/badge.svg?branch=dev" /></a>
    <a href="https://sonarcloud.io/dashboard?id=alfredo1996_neoboard"><img alt="Quality Gate" src="https://sonarcloud.io/api/project_badges/measure?project=alfredo1996_neoboard&metric=alert_status" /></a>
    <a href="https://sonarcloud.io/component_measures?id=alfredo1996_neoboard&metric=coverage"><img alt="Coverage" src="https://sonarcloud.io/api/project_badges/measure?project=alfredo1996_neoboard&metric=coverage" /></a>
    <a href="LICENSE"><img alt="License: Elastic-2.0" src="https://img.shields.io/badge/License-Elastic--2.0-blue" /></a>
  </p>
  <p align="center">
    <img alt="Node >= 20" src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" />
    <a href="https://github.com/alfredo1996/neoboard/pkgs/container/neoboard"><img alt="Docker" src="https://img.shields.io/badge/docker-ghcr.io%2Fneoboard-2496ED?logo=docker&logoColor=white" /></a>
    <a href="https://github.com/alfredo1996/neoboard/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/alfredo1996/neoboard?style=social" /></a>
    <a href="https://github.com/alfredo1996/neoboard/issues?q=label%3A%22good+first+issue%22"><img alt="Good First Issues" src="https://img.shields.io/github/issues/alfredo1996/neoboard/good%20first%20issue?color=7057ff&label=good%20first%20issues" /></a>
  </p>
</p>

---

![NeoBoard Dashboard](screenshots/03-dashboard-edit.png)

**NeoBoard** is a free, self-hosted dashboarding platform for teams working with Neo4j graph databases and PostgreSQL. Build interactive dashboards with 20 chart types, write queries directly, and share insights — all from a modern web interface.

## Why NeoBoard?

- **NeoDash alternative** — built for teams migrating from Neo4j's deprecated NeoDash
- **Hybrid databases** — connect Neo4j and PostgreSQL in the same dashboard
- **Modern stack** — Next.js 16, React 19, TypeScript, ECharts, Zustand, TanStack Query
- **Extensible charts** — 20 chart types with rule-based styling, click actions, and color palettes

## Quick Start

### Development

```bash
git clone https://github.com/alfredo1996/neoboard.git
cd neoboard
scripts/setup.sh   # Installs deps, starts Docker, runs migrations
npm run dev         # http://localhost:3000
```

Create your first admin at `/signup` using the bootstrap token printed during setup.

If something breaks during install (port conflict, DB refuses, migration fails, lost encryption key), see the [Troubleshooting Setup](https://github.com/alfredo1996/neoboard/blob/main/docs/src/content/docs/getting-started/troubleshooting.mdx) guide.

### Demo showcases

Want pre-loaded dashboards that demo every chart type, every click-action, every transform, and rule-based styling? Use the `neoboard demo` CLI:

```bash
neoboard demo                                 # full setup + seed everything
neoboard demo seed                            # reseed showcases only
neoboard demo seed --only=chart-gallery       # reseed a subset
neoboard demo list                            # print available showcases
neoboard demo reset --force                   # purge showcase dashboards + demo schema
```

Four showcase dashboards get seeded:

| Showcase           | Pages | What it demonstrates                                                                       |
| ------------------ | ----- | ------------------------------------------------------------------------------------------ |
| Chart Gallery      | 20    | One page per registered chart type on the demo e-commerce data                             |
| Click Actions      | 5     | Drilldown, page navigation, and combined set-parameter-and-navigate                        |
| Transformations    | 6     | Before/after for `filter`, `sort`, `groupBy`, `calculatedColumn`, `renameColumns`, `limit` |
| Rule-Based Styling | 9     | Numeric, text, between-operator, and parameter-reference rules across chart types          |

The showcases live as portable JSON files under `scripts/demo/*.json` validated against `neoboardExportSchema` — you can import them on any NeoBoard instance.

The demo e-commerce data (customers, products, categories, orders, order_items, regions) is isolated in the `neoboard_demo_public` Postgres schema so `neoboard demo reset` can drop it without touching your own tables.

Demo login: `admin@neoboard.local` / `admin123`

### Docker (Production)

```bash
cp app/.env.example app/.env.local   # Fill in your secrets
docker compose -f docker/docker-compose.prod.yml up
```

See [`app/.env.example`](app/.env.example) for required environment variables.

> 🎥 **No time to install?** Watch the [2-minute walkthrough](https://github.com/alfredo1996/neoboard/wiki/Demo) or browse the [screenshots](#screenshots) below.

## Features

| Category          | Details                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Charts**        | 20 types: Bar, Line, Pie, Table, Single Value, Gauge, Radar, Sankey, Sunburst, Treemap, Gantt, Circle Packing, Choropleth, Graph, Map, JSON, Form, Markdown, iFrame, Parameter Select |
| **Connectors**    | Neo4j (Bolt), PostgreSQL                                                                                                                                                              |
| **Parameters**    | Select, Multi-Select, Date, Date Range, Freetext — with cross-widget binding                                                                                                          |
| **Forms**         | Write queries (CREATE/INSERT) with form fields editor                                                                                                                                 |
| **Transforms**    | Client-side filter, sort, groupBy, calculatedColumn, rename, limit pipeline                                                                                                           |
| **Styling**       | Rule-based conditional styling, color scales, colorblind mode                                                                                                                         |
| **Interactivity** | Click actions (set parameter, navigate page), fullscreen widgets                                                                                                                      |
| **Export**        | CSV export, JSON dashboard import/export                                                                                                                                              |
| **Security**      | AES-256-GCM credential encryption, multi-tenant isolation, parameterized queries                                                                                                      |

## Ecosystem & Community

NeoBoard has a plugin system for custom chart types and database connectors. See the full [Plugin Ecosystem](PLUGINS.md) directory.

- **20 built-in charts** — Bar, Line, Pie, Table, Graph, Map, Gauge, Sankey, and more
- **2 built-in connectors** — Neo4j and PostgreSQL
- **Extensible** — Build and publish your own plugins via npm
- **Community directory** — Share and discover third-party extensions

## Screenshots

<p align="center">
  <img src="screenshots/01-login.png" alt="NeoBoard login page" width="700" />
</p>
<p align="center"><em>Login page</em></p>

<p align="center">
  <img src="screenshots/03-dashboard-edit.png" alt="Dashboard view with widgets" width="700" />
</p>
<p align="center"><em>Dashboard in edit mode</em></p>

<p align="center">
  <img src="screenshots/04-widget-editor-data-tab.png" alt="Widget editor with query and chart options" width="700" />
</p>
<p align="center"><em>Widget editor - data tab</em></p>

<p align="center">
  <img src="screenshots/02-dashboards-home.png" alt="Dashboards home page listing all dashboards" width="700" />
</p>
<p align="center"><em>Dashboards home</em></p>

## Architecture

```
neoboard/
├── app/           # Next.js 16 application (API routes, pages, stores)
├── component/     # React UI library (charts, widgets, design system)
├── connection/    # Database connector library (Neo4j, PostgreSQL)
├── docker/        # Docker Compose for dev containers
├── docs/          # Documentation site
└── scripts/       # Setup and seed scripts
```

Three packages with **strict boundaries**: `app/` orchestrates, `component/` renders, `connection/` queries. No cross-imports between `component/` and `connection/`.

## Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for local setup, project structure, and development workflow. For PR etiquette, branch naming, and code style, see [CONTRIBUTING.md](.github/CONTRIBUTING.md).

Looking for a first contribution? Check issues labeled [`good first issue`](https://github.com/alfredo1996/neoboard/labels/good%20first%20issue).

### Branch Strategy

| Branch        | Purpose                                       |
| ------------- | --------------------------------------------- |
| `main`        | Stable releases                               |
| `dev`         | Integration branch for ongoing work           |
| `release/X.Y` | Release stabilization before merging to `dev` |

Feature and fix branches target `dev` by default, or the active `release/X.Y` branch when one exists.

## Migrating from NeoDash

NeoBoard provides a dedicated migration path for teams moving from Neo4j's deprecated NeoDash. The `neoboard migrate` CLI command converts your NeoDash JSON exports into NeoBoard-compatible dashboards, mapping chart types, parameters, and layout automatically. See the [NeoDash Migration Guide](docs/NEODASH_MIGRATION_GUIDE.md) for step-by-step instructions and a list of supported widget mappings.

## API Documentation

Running the app exposes interactive API docs at `/api/docs`. The docs cover all REST endpoints for connections, dashboards, sharing, query execution, and admin operations.

## License

[Elastic License 2.0](LICENSE) with AI training restriction. Free to use, modify, and self-host. See [LICENSE](LICENSE) for full terms.
