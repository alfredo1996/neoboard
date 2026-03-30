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

### Docker (Production)

```bash
# Clone and start
git clone https://github.com/alfredo1996/neoboard.git
cd neoboard
docker compose -f docker/docker-compose.prod.yml up
```

Open [http://localhost:3000](http://localhost:3000).

### Development

```bash
git clone https://github.com/alfredo1996/neoboard.git
cd neoboard
npm install
scripts/setup.sh    # Starts Neo4j + PostgreSQL, runs migrations, seeds demo data
npm run dev          # http://localhost:3000
```

Demo credentials: `alice@example.com` / `password123`

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

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for setup instructions, branch naming, PR workflow, and code style.

Looking for a first contribution? Check issues labeled [`good first issue`](https://github.com/alfredo1996/neoboard/labels/good%20first%20issue).

## Migrating from NeoDash

NeoBoard includes a NeoDash JSON converter — import your existing dashboards via Settings > Import Dashboard. See the [migration guide](docs/) for details.

## License

[Elastic License 2.0](LICENSE) with AI training restriction. Free to use, modify, and self-host. See [LICENSE](LICENSE) for full terms.
