# NeoBoard — Project Review & Competitive Analysis

_Generated: March 27, 2026_

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Health Dashboard](#2-project-health-dashboard)
3. [Architecture & Codebase Review](#3-architecture--codebase-review)
4. [Feature Inventory](#4-feature-inventory)
5. [Tech Stack Analysis](#5-tech-stack-analysis)
6. [Testing & Quality](#6-testing--quality)
7. [GitHub Project Analytics](#7-github-project-analytics)
8. [Competitive Landscape](#8-competitive-landscape)
9. [Feature Matrix — NeoBoard vs. Competitors](#9-feature-matrix--neoboard-vs-competitors)
10. [SWOT Analysis](#10-swot-analysis)
11. [Strategic Recommendations](#11-strategic-recommendations)

---

## 1. Executive Summary

NeoBoard is an open-source dashboarding tool for **hybrid database architectures** (Neo4j + PostgreSQL). It fills a gap that no other open-source BI tool addresses: unified dashboards across graph and relational databases.

**Key facts:**

- **Age:** 6 weeks (created Feb 11, 2026)
- **Progress:** 9 milestones completed (v0.1–v0.9.1), 62 issues closed, 64 PRs merged
- **Codebase:** 446 TypeScript files, ~3.1 MB source, 3 packages
- **Solo developer project** with disciplined engineering practices (TDD, CI/CD, SonarCloud, conventional commits)

**Market position:** The only open-source tool combining Neo4j graph visualization with relational BI in a single dashboard. NeoDash (the closest predecessor) was discontinued in September 2025.

---

## 2. Project Health Dashboard

| Metric                    | Value                                       | Assessment                                  |
| ------------------------- | ------------------------------------------- | ------------------------------------------- |
| Milestones completed      | 9 of 14                                     | On track                                    |
| Issues closed             | 62                                          | Healthy velocity                            |
| Issues open               | 60 (16 active + 28 backlog + 16 enterprise) | Well-organized                              |
| PRs merged                | 64                                          | High merge rate                             |
| PRs closed without merge  | 17                                          | Normal (consolidated into release branches) |
| CI pipeline               | 4 jobs (typecheck, unit, e2e, sonar)        | Comprehensive                               |
| Test suites               | 115 (app) + 98 (component) + 8 (connection) | Strong                                      |
| E2E specs                 | 31 Playwright suites                        | Covers core flows                           |
| Code coverage (app)       | ~44%                                        | Below 80% target                            |
| Code coverage (component) | ~77%                                        | Approaching 80% target                      |
| Build status              | Passing                                     | Stable                                      |
| Last commit               | March 27, 2026                              | Active today                                |

### Velocity Trend

| Period   | Milestone   | Issues Closed | Key Deliverables                            |
| -------- | ----------- | ------------- | ------------------------------------------- |
| Week 1–2 | v0.1–v0.3   | 23            | Auth, connectors, dashboard structure       |
| Week 2–3 | v0.4        | 15            | Widget power, chart settings, parameters    |
| Week 3–4 | v0.5–v0.6   | 10            | Interactivity, write queries, export/import |
| Week 4–5 | v0.7–v0.8   | 19            | REST API, API keys, charts, dark mode       |
| Week 5–6 | v0.9–v0.9.1 | 37            | Data transforms, table features, stability  |

---

## 3. Architecture & Codebase Review

### Package Structure (Strict Boundaries)

```
neoboard/
├── app/          # Next.js 15 application (213 TS files, 1.7 MB)
│   ├── src/app/api/    # 24 API routes
│   ├── src/stores/     # 6 Zustand stores (~26 KB)
│   ├── src/hooks/      # 13 React hooks
│   ├── src/lib/        # 77 library files
│   └── e2e/            # 31 Playwright specs
├── component/    # React UI library (209 TS files, 1.3 MB)
│   ├── src/ui/         # 30 shadcn/ui base components
│   ├── src/composed/   # 55+ custom components
│   ├── src/charts/     # Chart renderers + palettes
│   └── stories/        # 86 Storybook stories
└── connection/   # DB connector library (24 TS files, 124 KB)
    ├── src/neo4j/      # Neo4j module
    └── src/postgres/   # PostgreSQL module
```

### Architecture Strengths

1. **Clean separation of concerns** — UI library has zero business logic, connection layer has zero React
2. **Pluggable connector pattern** — factory-based instantiation, adapter abstraction
3. **Type safety everywhere** — TypeScript strict mode, Zod validation at API boundaries
4. **Security-first** — AES-256-GCM credential encryption, parameterized queries, read-only transactions, per-connector queuing
5. **Multi-tenancy scaffolding** — `tenant_id` on all tables, JWT claims

### Architecture Risks

1. **Monorepo without workspaces** — No npm/pnpm workspace; manual dependency coordination
2. **Single database for metadata** — PostgreSQL only for app state; no pluggable metadata store
3. **Auth.js beta** — Running v5.0.0-beta.25; API may shift before stable release
4. **Coverage gap** — App package at 44% (target 80%)

### Database Schema (9 tables)

| Table             | Purpose                                 | Multi-tenant |
| ----------------- | --------------------------------------- | :----------: |
| user              | Users with roles (admin/creator/reader) |      —       |
| account           | OAuth provider accounts                 |      —       |
| session           | Active sessions                         |      —       |
| verificationToken | Email verification                      |      —       |
| connection        | Encrypted DB connections                |     Yes      |
| dashboard         | Dashboard layouts + metadata            |     Yes      |
| dashboard_share   | Share permissions (viewer/editor)       |     Yes      |
| widget_template   | Widget Lab templates                    |     Yes      |
| api_key           | API key auth                            |     Yes      |

---

## 4. Feature Inventory

### Widget Types (14)

| Category    | Widgets                                                 |
| ----------- | ------------------------------------------------------- |
| **Charts**  | Bar, Line, Pie, Gauge, Sankey, Sunburst, Radar, Treemap |
| **Data**    | Table (DataGrid), Single Value, JSON Viewer             |
| **Graph**   | Neo4j Graph Visualization (NVL)                         |
| **Geo**     | Map (Leaflet)                                           |
| **Content** | Markdown (GFM), iFrame                                  |
| **Forms**   | Form Widget, Parameter Selector                         |

### Parameter System (8 types)

| Type             | Description                                           |
| ---------------- | ----------------------------------------------------- |
| text             | Free-text input                                       |
| select           | Single-select from query results                      |
| multi-select     | Multi-select dropdown                                 |
| date             | Date picker                                           |
| date-range       | ISO range (generates `_from` / `_to` params)          |
| date-relative    | Preset buttons (Today, Last 7 days, etc.)             |
| number-range     | Dual-handle slider (generates `_min` / `_max` params) |
| cascading-select | Re-fetches on parent parameter change                 |

**Parameter sources:** Click-action, Selector-widget, URL, Cross-dashboard (enterprise)

### Dashboard Features

- Create, edit, view, delete, duplicate
- Multi-page layout (V2 format)
- Export/import JSON (including NeoDash migration)
- Dashboard sharing with viewer/editor roles
- Widget thumbnails (auto-captured JPEG data-URI)
- Auto-refresh with configurable intervals
- Click actions (set-parameter, navigate-page, combined)

### Query & Data

- CodeMirror 6 editor with Cypher + SQL language support
- Server-side query execution with safety (read-only transactions, timeouts, row limits)
- Write query support with `can_write` permission (server-side enforced)
- Data transforms (OLAP-style pivoting, grouping)
- CSV export from widgets
- Conditional formatting / styling rules

### Authentication & Authorization

- Email/password auth (bcrypt, Auth.js v5)
- 3 roles: admin, creator, reader
- API key authentication with hashed storage
- Dashboard-level sharing (viewer/editor)

### API

- 24 REST endpoints
- OpenAPI/Swagger documentation
- API key auth for programmatic access

### Enterprise Hooks (scaffolded, not gated)

- Multi-tenancy via `tenant_id`
- SSO placeholder (SAML/OIDC planned for v1.0)
- Custom roles (planned for v1.0)
- Cross-dashboard parameters
- Feature registry + license validation (planned)

---

## 5. Tech Stack Analysis

### Core Dependencies

| Layer             | Technology        | Version               | Notes                          |
| ----------------- | ----------------- | --------------------- | ------------------------------ |
| Framework         | Next.js           | 15.3                  | App Router, latest stable      |
| UI                | React             | 19.2                  | Latest stable                  |
| Language          | TypeScript        | 5.9                   | Strict mode                    |
| Components        | shadcn/ui + Radix | 30 base + 55 composed | Modern, accessible             |
| Styling           | Tailwind CSS      | 3.4                   | Utility-first                  |
| Charts            | ECharts           | 6.0                   | Tree-shakeable imports         |
| Graph             | Neo4j NVL         | —                     | Official Neo4j viz library     |
| Maps              | Leaflet           | 1.9                   | Lightweight                    |
| Editor            | CodeMirror 6      | —                     | With Cypher + SQL              |
| State             | Zustand           | 5.0                   | Lightweight stores             |
| Data fetching     | TanStack Query    | 5.62                  | Cache, retry, stale management |
| ORM               | Drizzle           | 0.39                  | Type-safe, lightweight         |
| Auth              | Auth.js           | 5.0-beta.25           | JWT sessions                   |
| Validation        | Zod               | 3.24                  | API boundary validation        |
| Neo4j driver      | neo4j-driver      | 5.28                  | Official driver                |
| PG driver         | pg + postgres.js  | 8.20 / 3.4            | Dual drivers                   |
| Build (component) | Vite              | 7.2                   | Library format (ES + UMD)      |
| Docs (component)  | Storybook         | 10.2                  | 86 stories                     |
| Unit tests        | Vitest            | 4.0                   | V8 coverage provider           |
| E2E tests         | Playwright        | 1.58                  | Chromium, 31 specs             |
| Integration tests | Testcontainers    | 10.24                 | Neo4j + PG containers          |

### Stack Assessment

**Strengths:**

- Every dependency is current-generation (2025–2026 latest)
- TypeScript throughout — no JavaScript files, no `any` without justification
- Dual testing strategy (Vitest for logic, Playwright for UI) avoids jsdom pitfalls
- ECharts 6 with modular imports avoids bundle bloat
- Zustand over Redux: minimal boilerplate, better DX for this scale

**Risks:**

- Auth.js beta: potential breaking changes before 5.0 stable
- Dual PG drivers (pg + postgres.js): could consolidate to reduce surface area
- ECharts 6.0 is recent — fewer community resources than v5

---

## 6. Testing & Quality

### Test Infrastructure

| Layer                  | Tool                        | Suites                    | Coverage                   |
| ---------------------- | --------------------------- | ------------------------- | -------------------------- |
| App unit tests         | Vitest                      | 84 files                  | ~44%                       |
| Component unit tests   | Vitest                      | 12 chart + 86 story tests | ~77%                       |
| Connection integration | Jest + Testcontainers       | 8 files                   | —                          |
| E2E                    | Playwright                  | 31 specs                  | Collected via nextcov      |
| Storybook              | Vitest browser + Playwright | 86 stories                | Part of component coverage |

### CI Pipeline (GitHub Actions)

```
┌─────────────┐  ┌──────────────────┐  ┌─────────────┐
│  TypeCheck   │  │  Unit/Integration │  │    E2E      │
│  (tsc)       │  │  (Vitest + Jest)  │  │ (Playwright)│
│  10 min      │  │  20 min           │  │  35 min     │
└──────┬───────┘  └────────┬──────────┘  └──────┬──────┘
       │                   │                     │
       └───────────┬───────┴─────────────────────┘
                   │
           ┌───────▼────────┐
           │  SonarCloud    │
           │  Quality Gate  │
           │  10 min        │
           └────────────────┘
```

### Quality Gates

- ESLint with TypeScript plugin + Next.js rules
- Prettier formatting enforced via pre-commit hooks (Husky + lint-staged)
- SonarCloud: coverage, duplications, code smells, security hotspots, bugs
- Coverage target: 80% per package (not yet met in app/)

### Coverage Gap Analysis

| Package     | Current | Target | Gap  | Priority Items                       |
| ----------- | ------- | ------ | ---- | ------------------------------------ |
| app/        | ~44%    | 80%    | -36% | API routes, hooks, page-renderer     |
| component/  | ~77%    | 80%    | -3%  | Near target, story tests closing gap |
| connection/ | —       | 80%    | —    | Integration tests cover core paths   |

Open issues #189–#192 specifically track the coverage push work.

---

## 7. GitHub Project Analytics

### Repository Overview

| Metric        | Value                             |
| ------------- | --------------------------------- |
| Created       | February 11, 2026                 |
| Age           | 6 weeks                           |
| Total commits | ~325                              |
| Total issues  | 122 (62 closed, 60 open)          |
| Total PRs     | 82 (64 merged, 1 open, 17 closed) |
| Contributors  | 1 (solo developer)                |
| Stars         | 0                                 |
| Forks         | 0                                 |
| License       | None (not yet licensed)           |
| Branches      | 41                                |

### Milestone Roadmap

```
COMPLETED                           IN PROGRESS              PLANNED
─────────                           ───────────              ───────
v0.1 Foundation          (6)   ┌─► v0.9.1 Stability   (16)  v1.0 Enterprise Foundation (8)
v0.2 Connector Maturity  (8)   │   v0.10 Chart Excel.  (20)  v1.1 Enterprise Features  (10)
v0.3 Dashboard Structure (9)   │                              v1.2 Real-Time & Fed.     (0)
v0.4 Widget Power        (15)  │
v0.5 Interactivity       (10)  │
v0.6 Widget Lab          (0)   │
v0.7 API & Dev XP        (9)   │
v0.8 UX & Charts         (10)  │
v0.9 A11y & Transforms   (28) ─┘
                          ──
                          95 issues completed
```

### Issue Distribution

| Category      | Count | %   |
| ------------- | ----- | --- |
| Enhancement   | 106   | 87% |
| Bug           | 6     | 5%  |
| Tech debt     | 5     | 4%  |
| Testing       | 4     | 3%  |
| Documentation | 3     | 2%  |

### Label System (42 labels, 3 dimensions)

- **Package:** `pkg:app`, `pkg:component`, `pkg:connection`
- **Area:** `area:charts`, `area:widgets`, `area:dashboard`, `area:connectors`, `area:auth`, `area:query-exec`, `area:api`, `area:table`, `area:params`, `area:a11y`
- **Type:** `enhancement`, `bug`, `tech-debt`, `testing`, `documentation`, `enterprise`, `backlog`

### Active Work Streams

| Stream                | Issues                 | ,,Status               |
| --------------------- | ---------------------- | ---------------------- |
| Coverage push to 80%  | #189, #190, #191, #192 | Open (v0.9.1)          |
| CSV + GFM export      | #135, #143             | In PR #188             |
| Chart excellence      | 10 issues              | v0.10 (next milestone) |
| Enterprise foundation | 8 issues               | v1.0 (planned)         |

---

## 8. Competitive Landscape

### Market Map

```
                    Business Intelligence
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   SQL-focused         Hybrid DB          Monitoring
        │                  │                  │
   ┌────┴────┐        ┌───┴───┐         ┌───┴───┐
   │Metabase │        │NEOBOARD│         │Grafana│
   │Superset │        │       │         │       │
   │Redash   │        └───────┘         └───────┘
   └─────────┘
        │
   ┌────┴──────────┐
   │ dbt-native    │
   │ Lightdash     │
   │ Evidence      │
   └───────────────┘

        Low-code app builders (adjacent)
        ┌───────────┐
        │ Appsmith  │
        │ ToolJet   │
        └───────────┘

        Discontinued
        ┌───────────┐
        │ NeoDash   │ ← NeoBoard's predecessor
        └───────────┘
```

### Competitor Profiles

#### Metabase — The Gold Standard for Non-Technical BI

| Metric       | Value           |
| ------------ | --------------- |
| Stars        | 46,595          |
| Contributors | 392             |
| Age          | 11 years        |
| Commits/year | 6,931           |
| License      | AGPL-3.0        |
| Stack        | Clojure + React |
| Databases    | 20+ (SQL only)  |

**What they do best:** Point-and-click exploration, embedded analytics SDK, Metabot AI querying, polished UX. The benchmark for "make data accessible to non-technical users."

**What they lack:** No graph database support, no Neo4j, no Cypher. Clojure backend creates a high contributor barrier. AGPL restricts SaaS embedding without commercial license.

#### Apache Superset — The Enterprise Workhorse

| Metric       | Value                          |
| ------------ | ------------------------------ |
| Stars        | 71,181                         |
| Contributors | 422                            |
| Age          | 11 years                       |
| Commits/year | 3,131                          |
| License      | Apache-2.0                     |
| Stack        | Python/Flask + React           |
| Databases    | 40+ (SQL only, via SQLAlchemy) |

**What they do best:** Broadest SQL database support, 40+ chart types, pluggable viz architecture, Apache-2.0 license, semantic layer.

**What they lack:** No graph DB support, complex self-hosting (Redis + Celery), UI polish lags Metabase, steep learning curve.

#### Grafana — The Observability King

| Metric       | Value                   |
| ------------ | ----------------------- |
| Stars        | 72,830                  |
| Contributors | 370+                    |
| Age          | 12 years                |
| Commits/year | 10,831                  |
| License      | AGPL-3.0                |
| Stack        | Go + React              |
| Data sources | 100+ (plugin ecosystem) |

**What they do best:** Time-series monitoring, alerting, plugin marketplace (100+ data sources), single-binary deployment, highest dev velocity.

**What they lack:** Not designed for business intelligence, no semantic layer, no SQL IDE, limited analytical chart types. Has a community Neo4j plugin but it's basic and monitoring-oriented.

#### Redash — The SQL Analyst's Notebook (Maintenance Mode)

| Metric       | Value                |
| ------------ | -------------------- |
| Stars        | 28,307               |
| Contributors | 392                  |
| Age          | 12 years             |
| Commits/year | ~0 (dormant)         |
| License      | BSD-2-Clause         |
| Stack        | Python/Flask + React |
| Databases    | 35+                  |

**What they do best:** Query-first design, parameterized queries, broad data source support, BSD license (most permissive).

**What they lack:** Effectively abandoned after Databricks acquisition. No hosted option, no AI features, dated UI, zero development activity.

#### Lightdash — The dbt-Native BI

| Metric       | Value                      |
| ------------ | -------------------------- |
| Stars        | 5,664                      |
| Contributors | 150                        |
| Age          | 5 years                    |
| Commits/year | 6,501                      |
| License      | MIT                        |
| Stack        | TypeScript                 |
| Databases    | 9 (SQL warehouses via dbt) |

**What they do best:** Deepest dbt integration, auto-generated metrics from dbt models, AI-native features, MIT license, extremely active development.

**What they lack:** Requires dbt — useless without it. SQL warehouses only, no NoSQL, no graph DBs.

#### Evidence — Code-First BI

| Metric       | Value             |
| ------------ | ----------------- |
| Stars        | 6,100             |
| Contributors | 67                |
| Age          | 5 years           |
| Commits/year | 118 (slowing)     |
| License      | MIT               |
| Stack        | JavaScript/Svelte |
| Databases    | 15+               |

**What they do best:** SQL + Markdown generates reports, Git-native workflow, static site output, DuckDB in-browser.

**What they lack:** Not for non-technical users, no real-time dashboards, no drag-and-drop, slowing development.

#### NeoDash — The Discontinued Predecessor

| Metric       | Value                     |
| ------------ | ------------------------- |
| Stars        | 509                       |
| Contributors | 33                        |
| Age          | 5.5 years                 |
| Commits/year | 0 (discontinued Sep 2025) |
| License      | Apache-2.0                |
| Stack        | TypeScript/React          |
| Databases    | Neo4j only                |

**Significance to NeoBoard:** NeoDash is NeoBoard's spiritual predecessor. Its discontinuation creates an orphaned user base and validates the need NeoBoard fills. NeoBoard already supports NeoDash JSON import.

---

## 9. Feature Matrix — NeoBoard vs. Competitors

| Feature                  | NeoBoard | Metabase | Superset | Grafana  | Redash | Lightdash |
| ------------------------ | :------: | :------: | :------: | :------: | :----: | :-------: |
| **Data Sources**         |
| PostgreSQL               |   Yes    |   Yes    |   Yes    |   Yes    |  Yes   |    Yes    |
| Neo4j (Cypher)           | **Yes**  |    No    |    No    | Plugin\* |   No   |    No     |
| MySQL                    |    No    |   Yes    |   Yes    |   Yes    |  Yes   |    Yes    |
| Snowflake / BigQuery     |    No    |   Yes    |   Yes    |   Yes    |  Yes   |    Yes    |
| 10+ databases            |    No    |   Yes    |   Yes    |   Yes    |  Yes   |    No     |
| **Visualization**        |
| Bar / Line / Pie         |   Yes    |   Yes    |   Yes    |   Yes    |  Yes   |    Yes    |
| Gauge                    |   Yes    |   Yes    |   Yes    |   Yes    |   No   |    No     |
| Sankey                   |   Yes    |    No    |   Yes    |    No    |  Yes   |    No     |
| Sunburst / Treemap       |   Yes    |    No    |   Yes    |    No    |   No   |    No     |
| Radar                    |   Yes    |    No    |   Yes    |    No    |   No   |    No     |
| **Graph visualization**  | **Yes**  |    No    |    No    |    No    |   No   |    No     |
| Map (geo)                |   Yes    |   Yes    |   Yes    |   Yes    |  Yes   |    No     |
| Single Value / KPI       |   Yes    |   Yes    |   Yes    |   Yes    |  Yes   |    Yes    |
| Table / Data Grid        |   Yes    |   Yes    |   Yes    |   Yes    |  Yes   |    Yes    |
| Markdown widget          |   Yes    |    No    |    No    |   Yes    |   No   |    No     |
| iFrame widget            |   Yes    |    No    |    No    |    No    |   No   |    No     |
| Form widget (write-back) | **Yes**  | Partial  |    No    |    No    |   No   |    No     |
| **Dashboard Features**   |
| Multi-page dashboards    |   Yes    |    No    |    No    |    No    |   No   |    No     |
| Parameters / Filters     |   Yes    |   Yes    |   Yes    |   Yes    |  Yes   |    Yes    |
| Cascading parameters     |   Yes    |   Yes    |   Yes    |    No    |   No   |    No     |
| Cross-filtering          |   No\*   |   Yes    |   Yes    |    No    |   No   |    Yes    |
| Click actions            |   Yes    |   Yes    |   Yes    |   Yes    |   No   |    No     |
| Auto-refresh             |   Yes    |   Yes    |   Yes    |   Yes    |  Yes   |    No     |
| Dashboard export/import  |   Yes    |    No    |   Yes    |   Yes    |   No   |    No     |
| NeoDash import           | **Yes**  |    No    |    No    |    No    |   No   |    No     |
| Widget thumbnails        |   Yes    |   Yes    |   Yes    |   Yes    |   No   |    No     |
| Conditional formatting   |   Yes    |   Yes    |   Yes    |   Yes    |   No   |    No     |
| **Query & Data**         |
| SQL editor               |   Yes    |   Yes    |   Yes    |   No\*   |  Yes   |    No     |
| Cypher editor            | **Yes**  |    No    |    No    |    No    |   No   |    No     |
| Autocomplete             |   Yes    |   Yes    |   Yes    |    No    |  Yes   |    No     |
| Write queries            | **Yes**  | Partial  |    No    |    No    |   No   |    No     |
| Data transforms          |   Yes    |   Yes    |   Yes    |   Yes    |   No   |    Yes    |
| CSV export               |   Yes    |   Yes    |   Yes    |   Yes    |  Yes   |    Yes    |
| **Security**             |
| Multi-tenancy            |   Yes    |   Yes    |   Yes    |   Yes    |   No   |    Yes    |
| RBAC (3+ roles)          |   Yes    |   Yes    |   Yes    |   Yes    |   No   |    Yes    |
| Credential encryption    |   Yes    |   Yes    |   Yes    |   Yes    |   No   |    Yes    |
| Read-only enforcement    |   Yes    |   Yes    |   Yes    |   N/A    |  N/A   |    N/A    |
| API key auth             |   Yes    |    No    |   Yes    |   Yes    |  Yes   |    No     |
| SSO (SAML/OIDC)          | Planned  |   Yes    |   Yes    |   Yes    |   No   |    Yes    |
| Row-level security       |    No    |   Yes    |   Yes    |    No    |   No   |    Yes    |
| **Developer Experience** |
| REST API                 |   Yes    |   Yes    |   Yes    |   Yes    |  Yes   |    No     |
| OpenAPI docs             |   Yes    |    No    |   Yes    |   Yes    |   No   |    No     |
| Embedding SDK            |    No    |   Yes    |   Yes    |   Yes    |   No   |    No     |
| Plugin system            |    No    |   Yes    |   Yes    |   Yes    |   No   |    No     |
| **Operations**           |
| Alerts / Notifications   |    No    |   Yes    |   Yes    |   Yes    |  Yes   |    Yes    |
| Scheduled queries        |    No    |   Yes    |   Yes    |   Yes    |  Yes   |    Yes    |
| AI / NLP querying        |    No    |   Yes    |    No    |  Yes\*   |   No   |    Yes    |

_Grafana has a basic community Neo4j plugin; Grafana AI refers to Grafana Cloud features; Superset has no SQL IDE comparable to Redash; NeoBoard cross-filtering is partially implemented via click actions._

---

## 10. SWOT Analysis

### Strengths

1. **Unique positioning** — Only OSS tool for hybrid graph + relational dashboards
2. **Modern tech stack** — Next.js 15, React 19, TypeScript 5.9; easy for web developers to contribute
3. **Engineering discipline** — TDD, CI/CD with 4-job pipeline, SonarCloud, conventional commits, strict TypeScript
4. **Rich widget variety** — 14 widget types including graph viz, forms, and content widgets
5. **Security-first design** — AES-256-GCM encryption, parameterized queries, read-only transactions, per-connector queuing
6. **NeoDash migration path** — Built-in JSON import from discontinued predecessor
7. **Write-back capability** — Form widgets with server-side permission enforcement (rare in OSS BI)
8. **Multi-page dashboards** — Unique feature vs. Metabase and most competitors
9. **Fast iteration** — 95 issues completed in 6 weeks; strong solo-developer velocity

### Weaknesses

1. **Solo developer** — Bus factor of 1; no community contributors yet
2. **Zero community metrics** — 0 stars, 0 forks; no external adoption signal
3. **No license** — Repository has no license file; legally ambiguous for external use
4. **Coverage gaps** — App package at 44% vs. 80% target
5. **Only 2 databases** — Neo4j + PostgreSQL; competitors support 20–100+
6. **No alerting/scheduling** — Missing table-stakes features for production BI
7. **No embedding SDK** — Can't be embedded in other applications
8. **No AI/NLP features** — Competitors (Metabase, Lightdash, Grafana) are adding AI rapidly
9. **Auth.js beta dependency** — Running on pre-release auth framework
10. **No plugin system** — Can't extend with community-contributed connectors or visualizations

### Opportunities

1. **NeoDash discontinuation** — 509-star orphaned user base looking for alternatives
2. **Neo4j ecosystem gap** — Neo4j has no official dashboarding tool after NeoDash sunset
3. **Graph + SQL convergence** — Growing trend of polyglot persistence; organizations increasingly use graph alongside relational DBs
4. **Modern stack advantage** — TypeScript/React codebase is more contributor-friendly than Clojure (Metabase) or Python/Flask (Superset)
5. **Enterprise graph market** — Financial services, fraud detection, supply chain, knowledge graphs all use Neo4j + relational DBs
6. **Embedded graph analytics** — No competitor offers embeddable graph visualization dashboards
7. **dbt + graph** — Could integrate with dbt for SQL sources while maintaining graph capabilities

### Threats

1. **Metabase Neo4j plugin** — If Metabase adds a Neo4j driver (their plugin system supports it), they immediately threaten NeoBoard's niche with 46k stars of community behind them
2. **Grafana Neo4j plugin maturation** — The existing community plugin could evolve into a first-class integration
3. **Neo4j Console Dashboards** — Neo4j's own replacement for NeoDash (proprietary, cloud-only) could capture the graph dashboarding market
4. **Sustainability** — Solo projects without funding or community face burnout risk
5. **Network effects** — Competitors have years of content, tutorials, integrations, and job listings

---

## 11. Strategic Recommendations

### Immediate (Next 4 Weeks)

| Priority | Action                                             | Rationale                                                                                                                                                                 |
| -------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**   | **Add an open-source license** (MIT or Apache-2.0) | Without a license, NeoBoard is legally unusable by anyone. Apache-2.0 aligns with NeoDash and the Neo4j ecosystem. This is the single most important action for adoption. |
| **P0**   | **Close the coverage gap** (issues #189–#192)      | 44% app coverage undermines confidence. Completing v0.9.1 enables quality claims.                                                                                         |
| **P1**   | **Write a README and landing page**                | Zero documentation for external users; no way to understand what NeoBoard is without reading the code.                                                                    |
| **P1**   | **Publish to npm / Docker Hub**                    | Make it installable in under 5 minutes. `docker compose up` for the full stack.                                                                                           |

### Short-Term (1–3 Months)

| Priority | Action                                            | Rationale                                                                                                                          |
| -------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **P1**   | **Target NeoDash migration explicitly**           | Write a migration guide. Match remaining NeoDash features (Gantt, natural language). Market on Neo4j community forums and Discord. |
| **P1**   | **Add MySQL connector**                           | Third most requested DB in BI tools. Triples the addressable market with relatively low effort (pg adapter pattern is reusable).   |
| **P2**   | **Add alerts and scheduled queries**              | Table-stakes for production BI. Every competitor except Evidence has this.                                                         |
| **P2**   | **Add embedding support**                         | iframe + guest tokens at minimum. This is how Metabase and Superset win enterprise deals.                                          |
| **P2**   | **Create a Storybook-powered component showcase** | The 86 stories are a hidden asset. Deploy as a public demo.                                                                        |

### Medium-Term (3–6 Months)

| Priority | Action                                              | Rationale                                                                                                                                     |
| -------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1**   | **Plugin architecture for connectors**              | MySQL, MongoDB, ClickHouse, BigQuery — each additional connector multiplies the user base. A plugin system scales this without bloating core. |
| **P2**   | **AI-powered query generation**                     | "Ask in English, get Cypher + SQL" — unique selling point combining LLM with graph querying.                                                  |
| **P2**   | **SSO and enterprise features** (v1.0 milestone)    | Required for enterprise adoption.                                                                                                             |
| **P3**   | **Cross-filtering between graph and table widgets** | Unique capability no competitor can offer — click a node, filter a SQL table.                                                                 |

### Positioning Strategy

**Primary message:** _"The open-source dashboard for graph + relational data."_

**Target personas:**

1. **Neo4j teams** who also use PostgreSQL (immediate, uncontested)
2. **NeoDash refugees** looking for an active, maintained alternative
3. **Enterprise data teams** with polyglot persistence architectures
4. **Graph analytics practitioners** in fraud, supply chain, knowledge management

**Channels:**

- Neo4j Community Forums and Discord
- Graph database subreddits and Hacker News
- Dev.to / Medium articles on graph + relational dashboarding
- Neo4j partner ecosystem

**What NOT to compete on:**

- Don't try to be a better Metabase. You'll lose on UX polish and community size.
- Don't try to support 40+ databases. Focus on depth of integration with Neo4j + relational.
- Don't compete with Grafana on monitoring. Stay in the BI/analytics lane.

**Win on:**

- Graph + SQL in one dashboard (unique, uncontested)
- Modern developer experience (TypeScript, shadcn/ui, Storybook)
- Write-back forms + graph visualization (no competitor has both)
- NeoDash compatibility + active maintenance (predecessor is dead)

---

_End of report._
