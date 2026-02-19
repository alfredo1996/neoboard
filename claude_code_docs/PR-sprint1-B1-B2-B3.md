# PR: Sprint 1 — B1, B2, B3

**Branch:** `feat/sprint1-B1-B2-B3`
**Date:** 2026-02-18

---

## What was done

### B1 — PostgreSQL connector result format fix

**Problem:** `PostgresConnectionModule._runSqlQuery` was calling `onSuccess(parsedRecords)` with a flat array. Tests expected `{ records, summary }` and `chart-registry.ts` consumed that shape via its `toRecords()` helper.

**Fix:** Wrapped the result in `{ records, summary }` before calling `onSuccess`:
- `summary.executionTime` — measured via `Date.now()` before/after the query
- `summary.queryType` — derived from `config.accessMode === 'WRITE'`
- `summary.rowCount` — `parsedRecords.length`

**File:** `connection/src/postgresql/PostgresConnectionModule.ts`

---

### B2 — Connection library test suite + dev docs

**Problem:** Two Neo4j integration tests were timing out and there was no local setup guide.

**Fix:**
- `connection/__tests__/utils/setup.ts`: Added `waitForBoltReady()` — a Bolt connection retry loop that runs inside `globalSetup` after container startup. The existing `Wait.forLogMessage('Remote interface available at')` strategy fires when the HTTP interface is up, but Bolt may still need a moment. The healthcheck polls `RETURN 1` every 500 ms until it succeeds (up to 60 s), then lets Jest workers start. This eliminated all "container not ready" spurious timeout failures.
- `connection/jest.config.js`: Added `testTimeout: 15000`. Even on a warm container, parallel workers (16 test files) all opening new Neo4j driver connections simultaneously can push individual tests past Jest's 5 s default. 15 s covers realistic worst cases.
- `DEVELOPMENT.md`: Created at project root — covers prerequisites, Docker setup, environment config, migrations, and test commands for all three layers.

**Files:**
- `connection/__tests__/utils/setup.ts`
- `connection/jest.config.js`
- `DEVELOPMENT.md`

---

### B3 — Graph chart: NVL integration

**Problem:** `GraphChart` was implemented with ECharts, which doesn't support graph (node-link) visualisation natively. The task required migrating to `@neo4j-nvl/react`.

**Spike:** Installed `@neo4j-nvl/react@1.1.0`, confirmed React 19 compatibility and the `InteractiveNvlWrapper` API (`nodes`, `rels`, `layout`, `mouseEventCallbacks`). Decided to proceed with full migration.

**Fix:** Complete rewrite of `graph-chart.tsx`:
- `toNvlNode()` — maps `GraphNode` → NVL `Node` (caption, color, size clamped to [20, 60], pinned, x/y)
- `toNvlRelationship()` — maps `GraphEdge` → NVL `Relationship` with stable composite ID `rel-${source}-${target}-${index}`
- `toNvlLayout()` — maps `"force"` → `"forceDirected"`, `"circular"` → `"circular"`
- Empty state renders `"No graph data"` with a Cypher hint instead of an empty canvas
- Callback refs (`useRef`) prevent `InteractiveNvlWrapper` from re-mounting on every render
- Removed props that were ECharts-specific: `edgeStyle`, `categories`, `onNodeRightClick`, `error`, `loading`, `GraphChartRef`

Tests (`component/src/charts/__tests__/graph-chart.test.tsx`): full rewrite using `vi.mock('@neo4j-nvl/react')` with a captured-props pattern. 20 tests covering node/edge mapping, layout translation, showLabels, colors, sizes, pinned nodes, click callbacks, className, and empty state.

**Files:**
- `component/src/charts/graph-chart.tsx`
- `component/src/charts/__tests__/graph-chart.test.tsx`
- `component/src/charts/index.ts` (removed `GraphChartRef` export)
- `component/package.json` (added `@neo4j-nvl/react`)

---

### E2E test fixes (discovered during review)

Four Playwright tests were failing due to strict-mode violations (locators matching multiple elements) and one missing application behaviour:

| Test | Problem | Fix |
|------|---------|-----|
| `charts.spec.ts` — Neo4j table | `getByText("The Matrix")` matched "The Matrix Reloaded" and "The Matrix Revolutions" | `{ exact: true }` |
| `charts.spec.ts` — PostgreSQL table | OR-locator matched both "One Flew Over..." and "Top Gun" in the results | `.first()` on combined locator |
| `widgets.spec.ts` — PostgreSQL widget | Same partial-match issue as Neo4j table | `{ exact: true }` |
| `connections.spec.ts` — error badge | `getByText("Bad Creds")` matched two connections on retry; error badge never appeared | `.first()` + auto-test newly created connections in `connections/page.tsx` |

The connections page fix: `handleCreate` now calls `handleTest(newConn.id)` immediately after a connection is created, so the status badge updates without requiring a manual test action.

**Files:**
- `app/e2e/charts.spec.ts`
- `app/e2e/connections.spec.ts`
- `app/e2e/widgets.spec.ts`
- `app/src/app/(dashboard)/connections/page.tsx`

---

## Test results

| Layer | Tool | Count | Status |
|-------|------|-------|--------|
| Connection module (PostgreSQL) | Jest + Testcontainers | 16 tests | ✅ All pass |
| Connection module (Neo4j) | Jest + Testcontainers | 105 tests | ✅ All pass |
| Connection module (total) | Jest | 121 tests | ✅ All pass |
| Component library (unit) | Vitest | 565 tests | ✅ All pass |
| Component library (unit + storybook) | Vitest | 915 tests | ✅ All pass |
| App E2E | Playwright + Testcontainers | 54 tests | ✅ All pass |

---

## Key decisions

**Bolt healthcheck over per-test timeouts:** Individual `60000` timeouts were whack-a-mole — every new test file that ran first on a cold container would fail. The `waitForBoltReady()` in `globalSetup` fixes the root cause once. The `testTimeout: 15000` config handles residual connection-pool contention when 16 files connect simultaneously.

**NVL relationship IDs:** NVL requires a unique `id` on every `Relationship`. `GraphEdge` has no `id` field. A composite `rel-${source}-${target}-${index}` is unique within a single query result and stable across re-renders.

**`@neo4j-nvl/react` ships as CJS** while the component library is ESM. Vite converts it automatically via `optimizeDeps` — no configuration change needed.

**Auto-testing new connections:** The connections page `useEffect` auto-tests only on first load (guarded by `autoTestedRef`). Newly created connections were never tested. The fix — `handleTest(newConn.id)` immediately post-creation — is minimal and matches the user expectation that a newly saved connection shows its status.
