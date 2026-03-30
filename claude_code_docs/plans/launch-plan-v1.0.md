# NeoBoard v1.0 Community Launch Plan

**Target date:** End of April 2026 (~4 weeks)
**Goal:** Public OSS release targeting NeoDash refugees and the Neo4j community
**Non-goal:** Enterprise features (SSO, custom roles, licensing) -- deferred to post-launch

---

## Context

NeoDash is dead (last release Aug 2024, "no longer maintained"). Neo4j's replacement (Aura Dashboards) is cloud-only with 8 chart types vs NeoDash's 22. On-prem Neo4j users have **no dashboarding tool**. NeoBoard fills this gap with a modern stack, hybrid DB support (Neo4j + PostgreSQL), and active development.

The commercial NeoDash license (bundled with Neo4j Enterprise) is expected to reach EOL by end of H1 2026. This is our window.

---

## NeoDash Feature Parity Analysis

### Already covered (17/22 widget types)

| NeoDash Widget   | NeoBoard Equivalent          | Status                                                 |
| ---------------- | ---------------------------- | ------------------------------------------------------ |
| Table            | `table` (DataGrid)           | Full parity + conditional formatting, resize, grouping |
| Graph (2D)       | `graph` (NVL)                | Full parity                                            |
| Bar Chart        | `bar`                        | Full parity + stacked, DataZoom                        |
| Line Chart       | `line`                       | Full parity                                            |
| Pie Chart        | `pie`                        | Full parity + donut, Top-N                             |
| Single Value     | `single-value`               | Full parity                                            |
| Map              | `map` (Leaflet markers)      | Partial (no heatmap, no choropleth)                    |
| Sunburst         | `sunburst`                   | Full parity                                            |
| Treemap          | `treemap`                    | Full parity                                            |
| Sankey           | `sankey`                     | Full parity                                            |
| Radar            | `radar`                      | Full parity                                            |
| Gauge            | `gauge`                      | Full parity + thresholds                               |
| Markdown         | `markdown`                   | Full parity (GFM in PR #188)                           |
| iFrame           | `iframe`                     | Full parity                                            |
| JSON Viewer      | `json`                       | Full parity                                            |
| Parameter Select | `parameter-select` (8 types) | **Exceeds** NeoDash (5 types)                          |
| Form             | `form`                       | Full parity + PostgreSQL support                       |

### Gaps (5 widgets not in NeoBoard)

| NeoDash Widget     | Priority       | Recommendation                                              |
| ------------------ | -------------- | ----------------------------------------------------------- |
| Choropleth Map     | **P2 — Defer** | Niche use case. ECharts supports it but low ROI for launch. |
| Area Map (GeoJSON) | **P3 — Defer** | Even more niche. Backlog.                                   |
| 3D Graph           | **P3 — Defer** | Was NeoDash "Advanced Vis" extension. Not core.             |
| Circle Packing     | **P3 — Defer** | Rarely used. Sunburst/Treemap cover hierarchy.              |
| Gantt Chart        | **P3 — Defer** | Was NeoDash extension. Niche.                               |

**Verdict:** NeoBoard already has 17/22 widget types. The 5 missing ones are niche — none are blockers for launch. We **exceed** NeoDash on parameters (8 vs 5 types), forms (PostgreSQL support), and table features.

### Feature gaps that DO matter for NeoDash users

| Feature                           | NeoDash Has     | NeoBoard Has                            | Priority                                            |
| --------------------------------- | --------------- | --------------------------------------- | --------------------------------------------------- |
| NeoDash JSON import (converter)   | N/A             | Partial (iframe/markdown map to `json`) | **P0 — Fix**                                        |
| URL deep-linking for parameters   | Yes             | No                                      | **P1 — Add**                                        |
| Node property panel (graph click) | Yes             | No (#148)                               | **P1 — Add**                                        |
| Standalone/viewer mode            | Yes             | No                                      | **P2 — Defer to post-launch**                       |
| Natural language to Cypher        | Yes (extension) | No                                      | **P2 — Defer**                                      |
| Save dashboard to Neo4j           | Yes             | No (uses PostgreSQL)                    | **Skip** — different architecture, not a regression |
| Dashboard gallery / examples      | Yes             | No                                      | **P1 — Add** (ship demo dashboards in seed data)    |
| Heatmap layer on map              | Yes             | No (#161)                               | **P2 — Nice to have**                               |
| Default parameter values          | No              | No (#157)                               | **P1 — Add** (common request)                       |
| Fullscreen widget view            | Yes             | No                                      | **P2 — Small effort**                               |

---

## Restructured Milestones

### What to do with existing milestones

| Current Milestone        | Action                                                               | Reason                                                              |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| v0.9 (2 open)            | **Close** — merge remaining into launch                              | CSV export + GFM tables are in PR #188, merge them                  |
| v0.9.1 (4 open)          | **Restructure** — coverage is launch-critical but target 70% not 80% | 80% is aspirational; 70% is credible for a v1.0                     |
| v0.10 (10 open)          | **Cherry-pick** 3-4 items, defer rest to v1.1                        | Time-axis and default params matter; dual Y-axis doesn't for launch |
| v1.0 Enterprise (8 open) | **Rename to v2.0** and defer entirely                                | Enterprise is post-launch                                           |
| v1.1 Enterprise (8 open) | **Rename to v2.1** and defer entirely                                | Enterprise is post-launch                                           |
| v1.2 Real-Time (0 open)  | **Rename to v2.2** and defer                                         | No issues even created yet                                          |
| v0.7 (0 open)            | **Close**                                                            | Already complete                                                    |

### New milestone structure

```
v0.10 — Launch Prep: NeoDash Parity + Polish     (Week 1-2)
v0.11 — Launch Prep: OSS Essentials + Infra       (Week 2-3)
v1.0  — Community Release                         (Week 4)
v1.1  — Post-Launch: Chart Excellence + Community  (May-June)
v2.0  — Enterprise Foundation                      (H2 2026)
v2.1  — Enterprise Features                        (H2 2026)
```

---

## Week-by-Week Plan

### Week 1 (Mar 31 - Apr 4): NeoDash Parity + Critical Fixes

**Goal:** Close the feature gaps that NeoDash users will notice immediately.

| #     | Issue                                                                              | Package       | Effort | Notes                                                                                       |
| ----- | ---------------------------------------------------------------------------------- | ------------- | ------ | ------------------------------------------------------------------------------------------- |
| FIX   | Fix NeoDash converter: map `iframe` → `iframe`, `markdown` → `markdown`            | app           | S      | 2-line fix in `CHART_TYPE_MAP`                                                              |
| FIX   | Fix NeoDash converter: map `gauge`, `sankey`, `sunburst`, `radar`, `treemap` types | app           | S      | Add missing entries to `CHART_TYPE_MAP`                                                     |
| NEW   | URL parameter deep-linking for dashboard params                                    | app           | M      | Read `?param_name=value` from URL on dashboard load, write to parameter store               |
| #148  | Node property panel for graph chart                                                | component     | M      | Side panel on node click showing properties — key for graph users                           |
| #157  | Default parameter values                                                           | app           | M      | Default value field in param config, applied on dashboard load                              |
| NEW   | Demo dashboards in seed data                                                       | docker        | M      | 2-3 pre-built dashboards (Movies graph, Sales SQL, Hybrid) shipped with `docker compose up` |
| MERGE | PR #188 (CSV export + GFM tables)                                                  | app/component | —      | Already in flight                                                                           |

### Week 2 (Apr 7 - Apr 11): Polish + Quality

**Goal:** Get coverage credible, fix rough edges, improve DX.

| #    | Issue                                                      | Package   | Effort | Notes                                                                       |
| ---- | ---------------------------------------------------------- | --------- | ------ | --------------------------------------------------------------------------- |
| #189 | Push API route test coverage                               | app       | L      | Focus on the 10 most critical routes, not all 24                            |
| #190 | Push store and hook test coverage                          | app       | M      | Parameter store and dashboard store are highest priority                    |
| #191 | Push component coverage to 80%                             | component | S      | Already at 77%, small gap                                                   |
| #144 | Time-axis detection for line chart                         | component | M      | Auto-detect ISO dates, use `xAxis.type: 'time'` — important for time-series |
| #145 | LTTB sampling for large datasets                           | component | S      | One-liner: `sampling: 'lttb'` when points > 1000                            |
| NEW  | Fullscreen widget view                                     | component | S      | Expand button on widget card → renders in a dialog/overlay                  |
| FIX  | NeoDash converter: preserve report titles as widget titles | app       | S      | Currently drops `report.title`                                              |

### Week 3 (Apr 14 - Apr 18): OSS Infrastructure

**Goal:** Everything needed for public open-source project credibility.

| #   | Item                                              | Effort | Notes                                                                         |
| --- | ------------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| NEW | LICENSE file (Apache-2.0)                         | S      | One file. Aligns with NeoDash and Neo4j ecosystem.                            |
| NEW | CONTRIBUTING.md                                   | M      | Branch naming, PR workflow, TDD, commit conventions, first-contribution guide |
| NEW | CODE_OF_CONDUCT.md                                | S      | Contributor Covenant v2.1                                                     |
| NEW | SECURITY.md                                       | S      | Vulnerability disclosure, encryption warnings, supported versions             |
| NEW | `.github/ISSUE_TEMPLATE/bug-report.yml`           | S      | Structured YAML form                                                          |
| NEW | `.github/ISSUE_TEMPLATE/feature-request.yml`      | S      | Problem/solution format                                                       |
| NEW | `.github/PULL_REQUEST_TEMPLATE.md`                | S      | Summary, test plan, checklist                                                 |
| NEW | Production Dockerfile (multi-stage)               | M      | Next.js standalone build, `FROM node:20-alpine`                               |
| NEW | `docker-compose.prod.yml`                         | S      | Full stack: app + postgres + neo4j                                            |
| NEW | Deploy Fumadocs site (Vercel/Netlify)             | M      | `/docs` already exists, just needs deployment                                 |
| NEW | NeoDash migration guide (docs page)               | M      | Feature mapping, import steps, what's different                               |
| NEW | README overhaul with screenshots                  | M      | Hero screenshots, quick start, "Why NeoBoard", migration callout              |
| NEW | `.github/dependabot.yml`                          | S      | npm + GitHub Actions, weekly                                                  |
| NEW | GitHub repo topics + description + social preview | S      | Metadata for discoverability                                                  |

### Week 4 (Apr 21 - Apr 25): Launch

**Goal:** Tag v1.0, create GitHub Release, announce.

| #   | Item                                     | Effort | Notes                                                  |
| --- | ---------------------------------------- | ------ | ------------------------------------------------------ |
| NEW | CHANGELOG.md (retroactive v0.1 → v1.0)   | M      | Keep a Changelog format                                |
| NEW | GitHub Release v1.0 with release notes   | S      | Tag `v1.0.0`, attach changelog                         |
| NEW | Release workflow (GitHub Action)         | M      | On tag push: build, test, publish Docker image to GHCR |
| NEW | Push Docker image to ghcr.io             | S      | `ghcr.io/alfredo1996/neoboard:1.0.0` + `:latest`       |
| NEW | Deploy live demo (Railway/Render/Fly.io) | M      | Read-only instance with movies dataset                 |
| NEW | Tag 5-8 issues as `good first issue`     | S      | From backlog: docs, CSS, chart options, tests          |
| NEW | Neo4j community announcement             | —      | Forum post, Discord, dev.to article                    |
| NEW | Logo + favicon + og:image                | M      | Needs design work (or use a simple typographic logo)   |
| NEW | Enable GitHub Discussions                | S      | Categories: Announcements, Q&A, Ideas, Show & Tell     |
| NEW | Label cleanup (remove duplicates)        | S      | 42 → ~25 labels                                        |

---

## Issue Reclassification

### Move FROM v0.10 to v1.0 launch (cherry-pick)

| #    | Title                              | Reason                          |
| ---- | ---------------------------------- | ------------------------------- |
| #144 | Time-axis detection for line chart | Core for time-series dashboards |
| #145 | LTTB sampling for large datasets   | Trivial effort, big impact      |
| #157 | Default parameter values           | NeoDash parity, common request  |

### Keep in v0.10 → rename to v1.1 (post-launch)

| #    | Title                                | Reason                       |
| ---- | ------------------------------------ | ---------------------------- |
| #146 | Connect nulls and end labels         | Nice-to-have polish          |
| #147 | Click-to-drill-down sunburst/treemap | Cool but not launch-blocking |
| #149 | Zoom controls for graph              | Polish                       |
| #150 | Field validation for form            | Polish                       |
| #151 | Select dropdown for form             | Polish                       |
| #152 | Click action for single-value/gauge  | Polish                       |
| #159 | Dual Y-axis for line chart           | Niche                        |

### Move FROM backlog to v1.0 launch

| #    | Title                         | Reason                                  |
| ---- | ----------------------------- | --------------------------------------- |
| #148 | Node property panel for graph | NeoDash parity, graph users expect this |

### Defer enterprise milestones

| Current                                | New Name | Timeline |
| -------------------------------------- | -------- | -------- |
| v1.0 Enterprise Foundation (8 issues)  | **v2.0** | H2 2026  |
| v1.1 Enterprise Features (8 issues)    | **v2.1** | H2 2026  |
| v1.2 Real-Time & Federation (0 issues) | **v2.2** | H2 2026+ |

### Backlog items to tag `good first issue` (for launch)

| #    | Title                                        | Why it's good for newcomers               |
| ---- | -------------------------------------------- | ----------------------------------------- |
| #156 | Sankey link values + percentage tooltip      | Chart options change, well-scoped         |
| #153 | Marker color by value for map                | Color scale, isolated component           |
| #166 | Syntax highlighting for markdown code blocks | Standalone, uses existing markdown widget |
| #160 | Sparkline for single value                   | Small ECharts addition                    |
| #167 | Percentage stacked bar mode                  | Chart option toggle                       |

---

## Coverage Strategy for Launch

**Revised target: 70% overall (not 80%) for v1.0.**

80% is the long-term target. For launch, credibility requires:

- Component: 80% (currently 77%, almost there)
- App: 60%+ (currently 44%, focus on high-value routes and stores)
- Connection: maintain current level

**Priority test targets (highest ROI):**

1. API routes: `/api/connections`, `/api/dashboards`, `/api/query` — these are the core
2. Stores: `parameter-store`, `dashboard-store` — most complex logic
3. Hooks: `use-query-execution` — critical path
4. Skip: page-renderer, widget-editor-modal (these are UI — tested by E2E)

---

## What We're NOT Doing for Launch

Explicitly deferred to reduce scope:

| Feature                                                   | Why Not Now                |
| --------------------------------------------------------- | -------------------------- |
| SSO (SAML/OIDC)                                           | Enterprise, post-launch    |
| Custom roles                                              | Enterprise, post-launch    |
| Feature registry / licensing                              | Enterprise, post-launch    |
| Plugin/extension system                                   | Needs design, post-launch  |
| Embedding SDK                                             | Post-launch                |
| Alerts / scheduled queries                                | Post-launch (v1.1 or v1.2) |
| AI / NLP querying                                         | Post-launch (v1.2+)        |
| MySQL / additional connectors                             | Post-launch (v1.1)         |
| Choropleth / Area Map / 3D Graph / Circle Packing / Gantt | Post-launch backlog        |
| Standalone/viewer mode                                    | Post-launch (v1.1)         |
| Query result caching                                      | Enterprise, post-launch    |
| WebSocket / streaming                                     | v2.2                       |
| Cross-connection data merge                               | v2.2                       |
| npm publish for component lib                             | Post-launch                |

---

## Success Criteria for v1.0

| Metric                                  | Target |
| --------------------------------------- | ------ |
| All 17 chart types working              | Yes    |
| NeoDash JSON import (all types mapped)  | Yes    |
| Coverage: component >= 80%, app >= 60%  | Yes    |
| CI green on main                        | Yes    |
| SonarCloud quality gate passing         | Yes    |
| Production Docker image published       | Yes    |
| Docs site deployed                      | Yes    |
| Live demo running                       | Yes    |
| LICENSE + CONTRIBUTING + CoC + SECURITY | Yes    |
| Issue/PR templates                      | Yes    |
| README with screenshots                 | Yes    |
| GitHub Release with changelog           | Yes    |
| NeoDash migration guide published       | Yes    |
| 5+ issues tagged `good first issue`     | Yes    |

---

## Risks

| Risk                                     | Mitigation                                                        |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Coverage push takes longer than expected | Lower target to 60% app; focus on critical paths only             |
| Production Dockerfile has issues         | Start early (Week 2), test in CI                                  |
| No logo/design resources                 | Use typographic logo (clean font + icon from Lucide)              |
| Demo instance costs money                | Use free tier on Railway/Render (sufficient for demo)             |
| NeoDash users don't discover NeoBoard    | Active outreach: Neo4j forum, Discord, dev.to, HN                 |
| Week 4 slips                             | OSS infra (Week 3) is the hard deadline; launch can slip to May 2 |

---

_This plan replaces the previous v0.10/v1.0/v1.1 milestone structure. All enterprise work moves to v2.x._
