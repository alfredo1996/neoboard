# Changelog

All notable changes to NeoBoard are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

NeoBoard versioning resets at **1.0.0** to mark the first public release. The 2.0.0 entry below documents the pre-public development cycle and is kept for historical reference.

## [1.0.0] — 2026-05-17 — First public release

The polish cycle on top of `2.0.0` ahead of v1.0 going public. Focuses on first-time-user experience: clearer errors, actionable hints, troubleshooting docs, and fail-fast configuration.

### Added

- `neoboard logs` and `neoboard plugin` unit test coverage (#793, #794)
- Actionable error classification for `neoboard db migrate` failures with connection/lock/schema/unknown buckets and per-bucket recovery hints (#795)
- Comprehensive setup troubleshooting guide covering npm install, Docker port conflicts, DB connection refusals, migration drift, ENCRYPTION_KEY mistakes — plus runbooks for Apple Silicon Docker issues, OAuth redirect mismatches behind a reverse proxy, and production ENCRYPTION_KEY loss recovery (#796)
- Documentation for ENCRYPTION_KEY rotation and credential-loss semantics (#797)
- Advanced `defineChartPlugin` API documentation (#798)
- Actionable hints for plugin validator failures pointing at the authoring docs (#799)
- Connection test error classification (`auth` / `network` / `bad_uri`) with hint surface in the UI (#800)
- HTTP `Retry-After` header for transient query failures so clients back off correctly (#802)
- Healthcheck for the `neoboard` service in the full-stack Docker compose (#803)
- "Administration" section in the docs sidebar — deployment checklist, monitoring, and backup-restore pages are now navigable
- Fail-fast environment validation at cold start — required vars (`ENCRYPTION_KEY`, `NEXTAUTH_SECRET`, `DATABASE_URL`) are checked in `register()` and surface a clear stderr listing instead of cryptic runtime errors. `SKIP_ENV_VALIDATION=1` is the build-script escape hatch.
- Reader-role empty-dashboard state CTA — first-time readers now see a "Read the docs" button instead of a dead-end message
- `@neoboard/cli` published to npm — `npx @neoboard/cli setup` is the recommended install path

### Changed

- Comprehensive annotations on `app/.env.example` covering every variable, required/optional status, generation commands, and rotation warnings (#801)
- `REGISTRATION_ENABLED` default flipped to `false` so production deployments don't accidentally ship an open `/signup` endpoint. Dev and demo flows enable it explicitly.
- README quick start leads with `npx @neoboard/cli setup`; the cloned-repo path remains for contributors
- Workspace versions reset from `2.0.0` to `1.0.0` to match the first-public-release branding

### Fixed

- E2E suite updated to assert the new `408 + Retry-After` behavior for transient query failures introduced by #802

### Security

- Cold-start env validation refuses to boot when required secrets are missing or malformed, preventing the app from running with weak defaults

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
- /api/health endpoint for container orchestration and Docker healthchecks

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
- Resolved npm audit production vulnerabilities (lodash, postcss, uuid overrides)

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
