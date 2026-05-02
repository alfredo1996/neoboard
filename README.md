<p align="center">
  <h1 align="center">NeoBoard</h1>
  <p align="center">
    Open-source dashboards for Neo4j + PostgreSQL
    <br />
    <em>The modern alternative to NeoDash</em>
  </p>
  <p align="center">
    <a href="LICENSE"><img alt="License: ELv2" src="https://img.shields.io/badge/license-Elastic--2.0-blue" /></a>
    <a href="https://github.com/alfredo1996/neoboard/actions"><img alt="CI" src="https://github.com/alfredo1996/neoboard/actions/workflows/ci.yml/badge.svg" /></a>
    <a href="https://github.com/alfredo1996/neoboard/issues?q=label%3A%22good+first+issue%22"><img alt="Good First Issues" src="https://img.shields.io/github/issues/alfredo1996/neoboard/good%20first%20issue?color=7057ff" /></a>
  </p>
</p>

---

<!-- Replace with actual screenshot after first release -->

![NeoBoard Dashboard](docs/screenshots/hero.png)

## Why NeoBoard?

- **NeoDash alternative** — built for teams migrating from Neo4j's deprecated NeoDash
- **Hybrid databases** — connect Neo4j and PostgreSQL in the same dashboard
- **Modern stack** — Next.js 15, React 19, TypeScript, ECharts, Zustand, TanStack Query
- **Extensible charts** — 12+ chart types with rule-based styling, click actions, and color palettes

## Quick Start

### Development

```bash
git clone https://github.com/alfredo1996/neoboard.git
cd neoboard
scripts/setup.sh   # Installs deps, starts Docker, runs migrations
npm run dev         # http://localhost:3000
```

Create your first admin at `/signup` using the bootstrap token printed during setup.

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
| Chart Gallery      | 17    | One page per registered chart type on the demo e-commerce data                             |
| Click Actions      | 5     | Drilldown, page navigation, and combined set-parameter-and-navigate                        |
| Transformations    | 6     | Before/after for `filter`, `sort`, `groupBy`, `calculatedColumn`, `renameColumns`, `limit` |
| Rule-Based Styling | 9     | Numeric, text, between-operator, and parameter-reference rules across chart types          |

The showcases live as portable JSON files under `scripts/demo/*.json` validated against `neoboardExportSchema` — you can import them on any NeoBoard instance.

The demo e-commerce data (customers, products, categories, orders, order_items, regions) is isolated in the `neoboard_demo_public` Postgres schema so `neoboard demo reset` can drop it without touching your own tables.

Demo login: `admin@neoboard.local` / `admin123`

### Docker (Production)

```bash
cp .env.example app/.env.local   # Fill in your secrets
docker compose -f docker/docker-compose.prod.yml up
```

See [`.env.example`](.env.example) for required environment variables.

## Features

| Category          | Details                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------- |
| **Charts**        | Bar, Line, Pie, Table, Single Value, Gauge, Radar, Sankey, Sunburst, Treemap, Graph, Map |
| **Connectors**    | Neo4j (Bolt), PostgreSQL                                                                 |
| **Parameters**    | Select, Multi-Select, Date, Date Range, Freetext — with cross-widget binding             |
| **Forms**         | Write queries (CREATE/INSERT) with form fields editor                                    |
| **Transforms**    | Client-side filter, sort, groupBy, calculatedColumn, rename, limit pipeline              |
| **Styling**       | Rule-based conditional styling, color scales, colorblind mode                            |
| **Interactivity** | Click actions (set parameter, navigate page), fullscreen widgets                         |
| **Export**        | CSV export, JSON dashboard import/export                                                 |
| **Security**      | AES-256-GCM credential encryption, multi-tenant isolation, parameterized queries         |

## Architecture

```
neoboard/
├── app/           # Next.js 15 application (API routes, pages, stores)
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

## Migrating from NeoDash

NeoBoard includes a NeoDash JSON converter — import your existing dashboards via Settings > Import Dashboard. See the [migration guide](docs/) for details.

## License

[Elastic License 2.0](LICENSE) with AI training restriction. Free to use, modify, and self-host. See [LICENSE](LICENSE) for full terms.
