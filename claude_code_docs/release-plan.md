# Release Plan

> Generated: 2026-02-20
> Source: `PROJECT.md` + `claude_code_docs/TASKS.md`
> Total estimated effort: ~130-180 hours across 7 sprints

---

## Dependency Graph

```
B1 (PG fix) ----+
B2 (Docker)  ---+
                +---> F1 (Schema Manager) --+--> F3 (Parameters)
B3 (Graph/NVL)  |                           +--> F6 (Code Editor)
                |                           +--> F5 (Connector-first flow)
                |                           +--> F13 (Form chart)
                |
                +---> F2 (Dashboard Pages) ---> F4 (Export/Import)
                |
                +---> F9 (Connector UX)

F11a (Analysis doc) ---> F11b (Chart config implementation)
```

---

## v0.1 -- Stabilize
**Goal:** Fix critical bugs blocking core usage -- PostgreSQL connector, Docker/test infrastructure, Graph chart NVL integration.

| # | Issue | Title | Effort |
|---|-------|-------|--------|
| B1 | [#4](https://github.com/alfredo1996/neoboard/issues/4) | fix(connection): PostgreSQL connector not working correctly | 4-6h |
| B2 | [#5](https://github.com/alfredo1996/neoboard/issues/5) | fix(connection): Docker/connection library setup broken and tests failing | 4-6h |
| B3 | [#6](https://github.com/alfredo1996/neoboard/issues/6) | fix(charts): Graph chart broken -- integrate Neo4j NVL | 6-10h |

**Estimated effort:** 14-22h

---

## v0.2 -- Schema Foundation + Connector UX
**Goal:** Build the schema manager abstraction that unblocks autocompletion, parameters, connector-first flow, and form charts. Improve connector UX.

| # | Issue | Title | Effort |
|---|-------|-------|--------|
| F1 | [#7](https://github.com/alfredo1996/neoboard/issues/7) | feat(connection): Schema Manager abstraction with Neo4j and PostgreSQL implementations | 8-12h |
| F9 | [#8](https://github.com/alfredo1996/neoboard/issues/8) | feat(app): Connector UX improvements -- type-first flow, card actions, error visibility | 4-5h |

**Depends on:** v0.1
**Estimated effort:** 12-17h

---

## v0.3 -- Pages + Parameters
**Goal:** Multi-page dashboards and full parameter selector system with 8 widget types.

| # | Issue | Title | Effort |
|---|-------|-------|--------|
| F2 | [#9](https://github.com/alfredo1996/neoboard/issues/9) | feat(app): Dashboard pages/tabs with multi-page layout | 6-8h |
| F3 | [#10](https://github.com/alfredo1996/neoboard/issues/10) | feat(app): Parameter selectors -- 8 widget types, parameter store, reactive re-query | 14-18h |

**Depends on:** v0.2 (F1 for parameter seed query UX)
**Estimated effort:** 20-26h

---

## v0.4 -- Import/Export + Connector-First Flow
**Goal:** Dashboard portability (export/import with NeoDash conversion), connector-aware widget creation, bulk connector import.

| # | Issue | Title | Effort |
|---|-------|-------|--------|
| F4 | [#11](https://github.com/alfredo1996/neoboard/issues/11) | feat(app): Dashboard export/import with NeoDash format conversion | 8-10h |
| F5 | [#12](https://github.com/alfredo1996/neoboard/issues/12) | feat(app): Connector-first widget creation flow with chart-connector affinity | 3-4h |
| F8 | [#13](https://github.com/alfredo1996/neoboard/issues/13) | feat(app): Bulk connection import via JSON upload | 3-4h |

**Depends on:** v0.3 (F2 for pages in export format), v0.2 (F1 for connector-first)
**Estimated effort:** 14-18h

---

## v0.5 -- Editor + Chart UX
**Goal:** CodeMirror code editor with schema autocompletion, on-the-fly column mapping, table pagination.

| # | Issue | Title | Effort |
|---|-------|-------|--------|
| F6 | [#14](https://github.com/alfredo1996/neoboard/issues/14) | feat(component): Code editor with CodeMirror 6, syntax highlighting, and schema autocompletion | 8-10h |
| F10 | [#15](https://github.com/alfredo1996/neoboard/issues/15) | feat(app): On-the-fly column mapping overlay for charts | 5-6h |
| F12 | [#16](https://github.com/alfredo1996/neoboard/issues/16) | feat(component): Table chart dynamic pagination based on container size | 2-3h |

**Depends on:** v0.2 (F1 for schema autocompletion)
**Estimated effort:** 15-19h

---

## v0.6 -- Chart Config Analysis + Chart Repo + Form
**Goal:** Produce chart configuration analysis document, build chart repository feature, implement form chart type with write operations.

| # | Issue | Title | Effort |
|---|-------|-------|--------|
| F11a | [#17](https://github.com/alfredo1996/neoboard/issues/17) | docs(charts): Chart configuration options analysis document | 4-6h |
| F7 | [#18](https://github.com/alfredo1996/neoboard/issues/18) | feat(app): Chart repository -- save, browse, and reuse widget templates | 10-14h |
| F13 | [#19](https://github.com/alfredo1996/neoboard/issues/19) | feat(app): Form chart type with write query execution | 8-10h |

**Depends on:** v0.2 (F1 for form dynamic selects)
**Estimated effort:** 22-30h

---

## v0.7 -- Chart Config Impl + Polish + Tests
**Goal:** Full chart configuration implementation from the analysis doc, design system, additional chart types, markdown/iframe widgets, auto-refresh, and comprehensive E2E coverage.

| # | Issue | Title | Effort |
|---|-------|-------|--------|
| F11b | [#20](https://github.com/alfredo1996/neoboard/issues/20) | feat(component): Full chart configuration options implementation | 16-24h |
| F14 | [#21](https://github.com/alfredo1996/neoboard/issues/21) | feat(component): UX design system -- Deep Ocean palette, chart colors, ECharts themes | 3-4h |
| F15 | [#22](https://github.com/alfredo1996/neoboard/issues/22) | feat(app): Dashboard metadata display -- updatedBy, timestamps, widget count | 2-3h |
| F16 | [#23](https://github.com/alfredo1996/neoboard/issues/23) | feat(component): Additional chart types -- Gauge, Sankey, Sunburst, Radar, Treemap | 10-15h |
| F17 | [#24](https://github.com/alfredo1996/neoboard/issues/24) | feat(component): Markdown and iFrame widget types | 2-3h |
| F18 | [#25](https://github.com/alfredo1996/neoboard/issues/25) | feat(app): Auto-refresh with configurable interval and per-dashboard toggle | 2-3h |
| F19 | [#26](https://github.com/alfredo1996/neoboard/issues/26) | test(e2e): Comprehensive E2E test coverage for critical flows | 6-8h |

**Depends on:** v0.6 (F11a for chart config analysis)
**Estimated effort:** 33-48h (spread across chart types)

---

## Enterprise Features (not yet scheduled)

These features are gated by env vars and will be planned after the open-source foundation is complete:

| Feature | Category |
|---------|----------|
| SSO Authentication (SAML/OIDC) | User Management |
| Custom Roles (capability-based RBAC) | User Management |
| Connector Labels (environment tags) | Connectors |
| Connector CRUD API | Connectors |
| Dashboard Sharing Links | Dashboards |
| Query Result Caching (LRU) | Dashboards |
| Environment Selector | Dashboards |
| Connector Alias | Widgets |

---

## Notes

- Estimates are preliminary and should be revised before each sprint based on actual codebase complexity.
- Sprint 1 (v0.1) is already in progress on branch `feat/sprint1-B1-B2-B3`.
- F7 (Chart Repository) is the most speculative task -- defer first if capacity is tight.
- F11 requires an approved analysis document before implementation begins.
- All enterprise features come after the open-source foundation is solid.
