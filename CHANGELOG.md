# Changelog

All notable changes to NeoBoard are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.0] — 2026-05-02

### Added

- CSV export for widget cards (RFC 4180 compliant, formula-prefix quoting)
- GFM markdown table support with alignment markers
- Clickable missing parameter badges with scroll-to-source
- Client-side data transforms pipeline (filter, sort, groupBy, calculatedColumn, rename, limit)
- Transform tab in widget editor with pipeline-aware column propagation
- Parameter support ($param_xxx) in transform filter values and calculated expressions
- Production Dockerfile and docker-compose.prod.yml
- OSS governance files (LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY)
- GitHub issue and PR templates
- Dependabot configuration for automated dependency updates
- Husky pre-commit hook with lint-staged (ESLint + Prettier)
- jsdom component tests enabled in app/ package
- Demo seed dashboards (Transform Playground)
- Database selector for per-widget database/schema override (#633)
- Per-card write toggle with server-side `can_write` enforcement (#633)
- Circle packing and choropleth chart gallery demo pages (#630)
- NeoDash migration tool: settings mapping and conversion notes (#626)
- Widget editor sub-component unit tests (#628)

### Changed

- License: Elastic License 2.0 with AI training restriction
- Widget editor: eliminated bidirectional state sync (Zustand store as single source of truth)
- Extracted pure business logic from components into testable lib/ files
- Widget editor decomposed into focused sub-components (#627)

### Fixed

- XSS: split URL validators (link vs image), strip tab/newline bypass
- CSV injection: quote cells starting with =, @, +, -
- Cache invalidation key in widget editor (was using widget.id instead of query key)
- Editor cache lookup for parameterized widgets (partial key match)
- Null/undefined values matching numeric zero in transform filters
- Query editor test teardown leak (dangling timers)
- Build: resolve pg/tls client bundle error breaking E2E tests (#629)
- Pre-existing type errors on release/2.0 branch (#632)

### Security

- Markdown widget: block data:image/svg+xml in link href (XSS vector)
- URL sanitization: strip ASCII tabs/newlines before protocol check

## [0.9.1] — 2026-03-27

### Added

- Connection pluggability: abstract driver type, ConnectorError normalization, split AdvancedConnectionOptions
- Coverage push: app hooks 18%→61%, component 77%→85%, cypher-lang smoke tests
- E2E tests for v0.9 features
- CI and CodeRabbit config for release/\* branches

### Fixed

- Flaky E2E tests marked as test.fixme()
- SonarCloud code smells and security hotspots

## [0.8.0] — 2026-03-17

### Added

- New chart types: Gauge, Sankey, Sunburst, Radar, Treemap
- Rule-based styling with operators, parameter comparison, multi-target support
- Click actions: set-parameter, navigate-to-page, set-parameter-and-navigate
- Action rules editor with per-column click triggers
- Color palettes (deep-ocean, warm-sunset, neon, monochrome)
- Colorblind mode for all chart types
- Chart accessibility: ARIA labels, role="img"

## [0.7.0] — 2026-03-10

### Added

- REST API for connections, dashboards, users, widget templates
- API key authentication
- Swagger/OpenAPI documentation
- Widget Lab: save, browse, and apply widget templates

## [0.6.0] — 2026-03-03

### Added

- Widget Lab and template management
- Dashboard export/import (JSON)
- Widget duplication

## [0.5.0] — 2026-02-24

### Added

- Parameter widgets (select, multi-select, date, date-range, date-relative, freetext)
- Form widget with write query support
- Dashboard page tabs

## [0.4.0] — 2026-02-17

### Added

- Form widget for Neo4j CREATE/PostgreSQL INSERT
- Write query execution with can_write permission enforcement
- Form fields editor

## [0.3.0] — 2026-02-10

### Added

- Dashboard grid layout with drag-and-drop
- Multi-page dashboards
- Widget card with actions menu

## [0.2.0] — 2026-02-03

### Added

- PostgreSQL connector with connection pooling
- Advanced connection options (timeouts, pool size, SSL)
- Connection testing (inline and saved)

## [0.1.0] — 2026-01-27

### Added

- Initial foundation: Next.js 15, Auth.js v5, Drizzle ORM
- Neo4j connector with Cypher query execution
- Bar, Line, Pie, Table, Single Value, JSON Viewer chart types
- CodeMirror 6 query editor with Cypher syntax highlighting
- User management with admin/creator roles
- AES-256-GCM credential encryption
- Multi-tenant architecture with tenant_id isolation

[2.0.0]: https://github.com/alfredo1996/neoboard/releases/tag/v2.0.0
