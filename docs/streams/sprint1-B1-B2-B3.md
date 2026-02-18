# Sprint 1 — Stabilize: B1, B2, B3

**Branch:** `feat/sprint1-B1-B2-B3`
**Date:** 2026-02-18

---

## Features / Changes

### B1 — PostgreSQL connector result format fix

The connection module's `PostgresConnectionModule` was calling `onSuccess(parsedRecords)` with a flat array of `NeodashRecord` instances. This didn't match the expected result format (`{ records, summary }`) defined by the tests and needed by the app's `chart-registry.ts`.

**What changed:**
- `connection/src/postgresql/PostgresConnectionModule.ts`: `onSuccess` now receives `{ records, summary }` where `summary` contains `executionTime`, `queryType` (`'read'` or `'write'`), and `rowCount`.
- The app's `chart-registry.ts` was already prepared for this format via its `toRecords()` helper.

### B2 — Connection library test suite fixes + development docs

**What changed:**
- `connection/__tests__/neo4j/parser/parser-record-objects.ts`: Added missing 60-second timeout on the `'should correctly parse a Neo4j Path with ordered nodes'` test (was timing out at the 5s Jest default).
- `DEVELOPMENT.md`: Created comprehensive local setup guide covering prerequisites, Docker setup, dependency installation, environment configuration, migrations, running tests at all levels, and key commands.

### B3 — Graph chart: NVL integration

Replaced the ECharts-based `GraphChart` with an NVL (`@neo4j-nvl/react`) implementation.

**What changed:**
- `component/src/charts/graph-chart.tsx`: Complete rewrite using `InteractiveNvlWrapper` from `@neo4j-nvl/react`. Maps NeoBoard's internal `GraphNode`/`GraphEdge` types to NVL's `Node`/`Relationship` types. Handles empty/non-graph data gracefully with a user-facing error message.
- `component/src/charts/__tests__/graph-chart.test.tsx`: Rewritten to mock `@neo4j-nvl/react` and test the wrapper logic (mapping, empty state, click callbacks, layout mapping).
- `component/src/charts/index.ts`: Removed `GraphChartRef` export (no longer applicable with NVL).
- `component/package.json`: Added `@neo4j-nvl/react` dependency.

---

## Issues Found

### 1. Test format mismatch — PostgreSQL `onSuccess` callback (B1)
**Root cause:** Tests expected `result.records` and `result.summary` but the module called `onSuccess(parsedRecords)` passing a flat array directly. This was a spec/code drift — the tests represented the correct desired behavior.

**Resolution:** Wrapped result in `{ records, summary }` in `PostgresConnectionModule._runSqlQuery`. The `queryType` is derived from `config.accessMode === 'WRITE'`, and `executionTime` is measured via `Date.now()` before/after the query.

### 2. Missing test timeout — Neo4j path query (B2)
**Root cause:** The test `'should correctly parse a Neo4j Path with ordered nodes'` used a complex `ORDER BY ID(a), ID(m)` Cypher pattern that takes >5s against a fresh testcontainer. Other tests in the same file either ran faster or were the first test (benefiting from a warm connection). The test was missing a timeout override.

**Resolution:** Added `60000` ms timeout to the specific test, consistent with other Neo4j integration tests.

### 3. NVL is CJS but Vite handles it via optimizeDeps
**Detail:** `@neo4j-nvl/react` ships as CJS (`lib/index.js`) while the component library is ESM (`"type": "module"`). Vite automatically converts CJS dependencies to ESM via `optimizeDeps`. Verified clean installation with no peer-dependency conflicts.

### 4. Relationship IDs
**Detail:** NVL requires a unique `id` on every `Relationship`. Our `GraphEdge` type has no `id` field. We generate a stable composite ID from `rel-${source}-${target}-${index}` which is unique within a single query result set. This is sufficient for NVL's needs.

### 5. Props removed in NVL migration
The ECharts-based `GraphChart` had props that are no longer applicable:
- `edgeStyle` (curveness, width, opacity) — ECharts-specific; NVL has its own defaults
- `categories` — ECharts graph series concept; NVL uses node colors directly
- `onNodeRightClick` — could be added later via `InteractiveNvlWrapper`'s interaction modules
- `error` / `loading` — were from `BaseChartProps`; NVL manages its own loading state
- `GraphChartRef.zoomToFit` — NVL exposes `fit()` on its instance ref; not currently wired

None of these were used by `card-container.tsx` (the only consumer in the app).

---

## Solutions

| Issue | Solution | Rationale |
|-------|----------|-----------|
| onSuccess format mismatch | Wrap in `{ records, summary }` | Matches tests and app chart-registry expectation |
| Test timeout | Add 60s timeout to specific test | Consistent with Neo4j container startup cost |
| NVL relationship IDs | Composite key `rel-${from}-${to}-${index}` | Unique within result, stable across re-renders |
| Removed props | Document as out-of-scope | App consumer unchanged; can be re-added per feature requests |

---

## Acceptance Criteria

### B1
- [x] PostgreSQL connection can be created and tested successfully
- [x] `SELECT` queries return correctly formatted data for all chart types
- [x] Parameterized queries work (positional `$1, $2, ...` rewriting in app layer)
- [x] Tests pass: all 16 postgres-query tests pass

### B2
- [x] `docker-compose up` starts all containers cleanly (config unchanged, was working)
- [x] All connection library tests pass (121/121)
- [x] Test coverage exists for: connect, disconnect, read query, write query, error handling, rollback, truncation, timeout
- [x] Local setup documented in `DEVELOPMENT.md`

### B3
- [x] Graph chart renders nodes and edges from Neo4j query results (via NVL)
- [x] Layout algorithms work: `force` (→ `forceDirected`) and `circular`
- [x] Zoom and pan supported (via `InteractiveNvlWrapper` built-in interactions)
- [x] Click events fire — `onNodeSelect` called via `onNodeClick` callback
- [x] Non-graph data shows a clear error message ("No graph data"), no crash
- [x] NVL integrated as the rendering engine

---

## Testing Summary

| Layer | Tool | Count | Status |
|-------|------|-------|--------|
| Connection module (PostgreSQL) | Jest + Testcontainers | 16 tests | ✅ All pass |
| Connection module (Neo4j) | Jest + Testcontainers | 105 tests | ✅ All pass |
| Connection module (total) | Jest | 121 tests | ✅ All pass |
| Component library | Vitest + jsdom | 565 tests | ✅ All pass |
| GraphChart unit tests | Vitest (NVL mocked) | 20 tests | ✅ All pass |

### Test approach for GraphChart (B3)
Since NVL uses WebGL/Canvas rendering, direct rendering tests in jsdom would fail. We mock `@neo4j-nvl/react` with a simple `<div data-testid="nvl-wrapper" />` and capture props passed to it. Tests verify:
- Correct type mapping (GraphNode → NvlNode, GraphEdge → NvlRelationship)
- Layout name translation
- Empty state rendering
- Click callback wiring and selection toggle logic

---

## Known Limitations & Follow-up Items

1. **E2E graph tests**: B1 acceptance criteria mentions "E2E tests pass: connect → query → render". E2E graph tests (Playwright) are deferred to Sprint 7 (F19).
2. **Missing NVL features**: `onNodeRightClick`, custom edge styles, `zoomToFit` via ref are not yet wired. Can be added in F11/F3 when needed.
3. **Graph category colors**: The previous ECharts implementation supported `categories` for node coloring. NVL achieves this via `node.color` directly. Category-based coloring must be handled in `chart-registry.ts`'s `transformToGraphData` (map category → color) when implementing F11 graph options.
4. **NVL theming**: NVL has its own canvas-based theming. Dark mode integration (F14) will require setting NVL's `backgroundColor` and related options via `nvlOptions`.
5. **`@neo4j-nvl/react` version**: Installed version 1.1.0 (latest as of 2026-02-18). Monitor for updates.
