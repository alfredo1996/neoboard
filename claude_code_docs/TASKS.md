# NeoBoard — Prioritized Roadmap

> Last updated: 2026-02-18
> Format: Each task is a self-contained spec for Claude Code implementation.

---

## Development Guidelines — READ BEFORE ANY WORK

These rules apply to **every task** in this document. Violating them is a blocker for merging.

### 0. Read first, act second
Before writing a single line of code, **read the entire codebase relevant to the task**. Understand the existing architecture, patterns, naming conventions, and how the pieces connect. Then produce a plan. Do not start coding until you have a clear picture of what exists and how your changes fit in.

### 1. Branching strategy
- For each stream of work (a task or a group of related tasks), **create a branch from `main`** and work from there.
- Branch naming: `feat/<task-id>-short-description` (e.g., `feat/F1-schema-manager`, `fix/B1-pg-connector`).
- Keep commits atomic and well-described.

### 2. Testing is mandatory
- Every change must include **meaningful tests** — choose the right level based on what was modified:
    - **Unit tests** for pure logic, transforms, utilities, store actions.
    - **Integration tests** for API routes, DB queries, connection module methods.
    - **E2E tests** for user-facing flows (connection setup, widget creation, parameter interaction, export/import).
- If any test fails after your changes, **always fix it before moving on**. Determine whether:
    - The test needs to be **upgraded** because the behavior intentionally changed, or
    - You introduced a **regression** that must be fixed in your code.
- Never leave a branch with failing tests.

### 3. Code quality standards
- Code must be **elegant, well-documented, and tested**.
- Respect the **separation of responsibilities** between libraries:
    - `connection/` — database connectivity, query execution, schema fetching. No UI, no app-level concerns.
    - `component/` — reusable UI components, charts, composed widgets. No business logic, no API calls, no stores.
    - `app/` — application logic, API routes, stores, hooks, pages. Orchestrates `connection/` and `component/`.
- **Do not mix responsibilities.** If you're tempted to put app-level logic in `component/` or UI code in `connection/`, stop and refactor.
- Add JSDoc comments to all public interfaces, types, and non-trivial functions.
- Follow existing patterns (naming, file structure, import style) — consistency over personal preference.

### 4. Validate acceptance criteria before starting
For each task, **review the acceptance criteria** listed in this document and check whether they still fit the actual state of the project. If the codebase has evolved or the criteria are wrong/incomplete:
- **Redefine them** before starting implementation.
- Document what changed and why.

### 5. Stream-of-work documentation
When starting a stream of tasks (sprint or related group), **create a deliverable document** (`docs/streams/<stream-name>.md`) containing:
- **Features**: what is being built/changed, with context
- **Issues found**: any bugs, inconsistencies, or tech debt discovered during the work
- **Solutions**: how each issue was resolved, with rationale
- **Acceptance criteria**: final criteria (original or redefined per rule #4)
- **Testing summary**: what was tested, test types used, coverage notes
- **Anything else** useful for quality: performance observations, known limitations, follow-up items, architectural decisions made

This document is part of the deliverable — the stream is not complete without it.

### 6. Task prioritization rules
When deciding what to work on next, follow this order strictly:

1. **Bugs first** — always start with bug fixes (P0). However, if a bug will be resolved or significantly impacted by an upcoming feature (e.g., a bug in graph rendering that will be replaced by NVL integration), **skip it for now** and revisit after the feature is implemented. If the bug is still present after the feature work, fix it then.
2. **Features, sorted by complexity and effort** — after bugs are resolved (or deferred per the rule above), work on features in order of **lowest complexity/effort first**. Quick wins build momentum, reduce risk, and unblock dependent tasks faster. Only tackle high-effort features once the simpler ones are done, unless a high-effort feature is a dependency blocker (e.g., F1 Schema Manager blocks F3, F5, F6, F13 — do it first regardless of effort).

In summary: bugs → quick features → complex features, with dependency order overriding effort order when needed.

---

## Implementation Risks & Guidance

These notes provide strategic context for making good decisions during implementation. Read them before planning each sprint.

### Schema is the linchpin — get it right early
The schema manager (F1) is the single most important foundational piece. Parameters (F3), code editors (F6), connector-first flow (F5), and form chart dynamic selects (F13) all depend on it. If you try to build any of these without a working schema layer, you'll be reworking things constantly. Prioritize F1 and make sure its interfaces are clean and extensible — every shortcut here creates downstream pain.

### B3 (NVL integration) — spike early, expect friction
`@neo4j-nvl/react` may not play cleanly with the component library's existing patterns (props API, theming, sizing). Don't assume a drop-in replacement. Spike the integration early in Sprint 1 — build a minimal proof-of-concept that renders nodes/edges inside a `CardContainer`-sized div. If it doesn't fit, plan for a wrapper layer. Don't discover this late.

### F11 (Chart Configuration) — be ruthless about scope
ECharts has a massive API surface. The analysis document will be tempting to fill with every possible option. **Don't.** Focus on the 80% of options users will realistically use. The remaining 20% can be added later via a "raw JSON override" escape hatch if needed. When reviewing the analysis doc, cut anything that's rarely used or overly technical. Start lean, expand based on user feedback.

### F7 (Chart Repository) — most speculative, safest to defer
This is the only task that introduces a completely new entity, new DB table, new pages, and new user flows. It's high-effort and doesn't unblock anything else. If sprint capacity gets tight, defer F7 first. Everything else in the roadmap is more foundational or more immediately useful.

### Separation of concerns is non-negotiable
The three-library split (`connection/`, `component/`, `app/`) exists for a reason. During implementation you'll be tempted to put schema logic in the app, or store logic in the component library, or API calls in connection modules. Resist every time. If something doesn't have a clear home, stop and ask which library owns that responsibility. A clean architecture now saves massive refactoring later.

### Test failures are signals, not noise
When a test fails after your changes, don't reflexively update the test to make it pass. First determine: did the behavior intentionally change (update the test), or did you break something (fix your code)? This distinction is critical. Treating every failure as "test needs updating" is how regressions ship.

---

## Priority Legend

| Tag | Meaning |
|-----|---------|
| 🐛 BUG | Broken behavior — fix before feature work |
| 🚀 FEATURE | New capability |
| 🔧 IMPROVEMENT | Enhancement to existing functionality |
| P0 | Critical — blocks core usage |
| P1 | High — foundational for downstream tasks |
| P2 | Medium — significant user value |
| P3 | Nice-to-have — polish & extended capabilities |

---

## Dependency Graph

```
B1 (PG fix) ──┐
B2 (Docker)  ──┤
               ├──► F1 (Schema Manager) ──┬──► F3 (Parameters)
B3 (Graph/NVL) │                          ├──► F6 (Code Editor)
               │                          ├──► F5 (Connector-first flow)
               │                          └──► F13 (Form chart)
               │
               ├──► F2 (Dashboard Pages) ──► F4 (Export/Import)
               │
               └──► F9 (Connector UX)

F11 (Chart Options) requires analysis doc before implementation
```

---

## Suggested Sprint Plan

| Sprint | Items | Theme | Est. Effort |
|--------|-------|-------|:-----------:|
| **Sprint 1** | B1, B2, B3 | Stabilize — fix what's broken | ~14–22h |
| **Sprint 2** | F1, F9 | Schema foundation + connector UX | ~12–17h |
| **Sprint 3** | F2, F3 | Pages + parameters | ~20–26h |
| **Sprint 4** | F4, F5, F8 | Import/export + connector-first flow | ~14–18h |
| **Sprint 5** | F6, F10, F12 | Editor + chart UX | ~15–19h |
| **Sprint 6** | F11 (analysis), F7, F13 | Chart config analysis, chart repo, form chart | ~22–30h |
| **Sprint 7** | F11 (impl), F14–F19 | Chart config impl, polish, tests | ~33–48h |

**Total estimated effort: ~130–180 hours**

> ⚠️ **These are preliminary estimates based on the spec, not the actual codebase.** Before starting each sprint, Claude Code must review the relevant code and **corroborate or revise the effort estimates** based on the real complexity found. Update this document with revised estimates and reasoning before beginning implementation.

---
---

# P0 — Critical Bugs

---

## B1. 🐛 PostgreSQL connector not working correctly
> **Effort: ~4–6 hours** (diagnosis + fix + E2E tests)

### Context
Users cannot see their tables. The connector setup appears broken. Query result formatting was partially fixed (TASK_09 — `normalizeResult()` / `toPlainObjects()` implemented), but the underlying connection library has issues.

### What to fix
1. **Connection library**: diagnose why PostgreSQL connections fail or return incorrect data
2. **Table visibility**: ensure `information_schema` queries return the user's tables
3. **Result normalization**: verify `normalizeResult()` and `toPlainObjects()` work end-to-end for all chart types
4. **E2E tests**: add tests covering the full flow — connect → list tables → run query → see results in chart

### Files likely involved
- `connection/src/` — PostgreSQL connection module
- `app/src/lib/query-executor.ts` — result normalization
- `app/src/lib/chart-registry.ts` — transforms consuming results
- `docker/postgres/init.sql` — seed data
- `e2e/` or `tests/` — new E2E test files

### Acceptance criteria
- [ ] PostgreSQL connection can be created and tested successfully
- [ ] User's tables are visible (schema introspection works)
- [ ] `SELECT` queries return correctly formatted data for all chart types (bar, line, pie, table, single value, JSON viewer)
- [ ] E2E tests pass: connect → query → render

---

## B2. 🐛 Connection library setup is wrong & tests are broken
> **Effort: ~4–6 hours** (audit + Docker fixes + fix all tests + documentation)

### Context
Docker / connection-library configuration appears misconfigured. The connection library test suite is failing.

### What to fix
1. **Docker**: audit `docker-compose.yml` — ensure Neo4j and PostgreSQL containers start cleanly with correct ports, credentials, DB names
2. **`docker/postgres/init.sql`**: verify seed data is correct
3. **Connection module config**: validate host/port resolution matches Docker setup
4. **Fix all failing tests** in the connection library (unit + integration)
5. **Test containers**: ensure test config matches runtime config (ports, credentials, DB names)
6. **Add missing test coverage** for core paths: connect, disconnect, run query, error handling, schema fetch
7. **Document** the correct local setup in a `DEVELOPMENT.md` or README section

### Files likely involved
- `docker-compose.yml`
- `docker/postgres/init.sql`
- `connection/src/` — all connector modules
- `connection/tests/` or `connection/**/*.test.ts` — test files
- `README.md` or `DEVELOPMENT.md`

### Acceptance criteria
- [ ] `docker-compose up` starts all containers cleanly
- [ ] All connection library tests pass
- [ ] Test coverage exists for: connect, disconnect, run read query, run write query, error handling
- [ ] Local setup documented and reproducible from scratch

---

## B3. 🐛 Graph chart not working correctly
> **Effort: ~6–10 hours** (NVL evaluation + integration + wrapper + testing; spike early, may surface surprises)

### Context
The current graph visualization is broken or insufficient. Target: replace/integrate with **Neo4j NVL** (Neo4j Visualization Library).

### What to fix
1. **Evaluate NVL**: check the `@neo4j-nvl/react` npm package, its React wrapper, and compatibility
2. **Replace or wrap** the existing `GraphChart` component with NVL
3. **Required functionality**: node rendering, edge rendering, layout algorithms (force/hierarchical/circular), zoom, pan, click events
4. **Graceful fallback**: when data isn't a graph (e.g., PostgreSQL tabular result), show a meaningful error/message instead of crashing

### Files likely involved
- `component/src/charts/graph-chart.tsx` — replace/rewrite
- `component/package.json` — add `@neo4j-nvl/react` dependency
- `app/src/components/card-container.tsx` — graph rendering case
- `app/src/lib/chart-registry.ts` — graph transform

### Acceptance criteria
- [ ] Graph chart renders nodes and edges from Neo4j query results
- [ ] Layout, zoom, pan work correctly
- [ ] Click events fire (node click, edge click) — needed for future parameter actions
- [ ] Non-graph data shows a clear error message, no crash
- [ ] NVL integrated as the rendering engine

---
---

# P1 — High Priority Features

---

## F1. 🚀 Schema Manager in Connection Library
> **Effort: ~8–12 hours** (abstraction design + Neo4j impl + PostgreSQL impl + API endpoint + Zustand store + hook + auto-fetch on save + tests)

### Context
No schema awareness anywhere in the system. Multiple features depend on it: autocompletion (F6), parameter search (F3), chart-type filtering (F5), form chart dynamic selects (F13).

### Architecture

#### 1. Schema Manager abstraction (in connection library)
```typescript
// connection/src/schema/schema-manager.ts
export interface SchemaManager {
  fetchSchema(config: ConnectionConfig): Promise<DatabaseSchema>;
}
```

Each connector type implements this:

**Neo4j** — queries:
```cypher
CALL db.schema.nodeTypeProperties() YIELD nodeType, propertyName, propertyTypes
CALL db.schema.relTypeProperties() YIELD relType, propertyName, propertyTypes
CALL db.labels() YIELD label
CALL db.relationshipTypes() YIELD relationshipType
```

**PostgreSQL** — queries:
```sql
SELECT t.table_name, c.column_name, c.data_type, c.is_nullable
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;
```

#### 2. Normalized schema type (shared between library and app)
```typescript
export interface DatabaseSchema {
  type: 'neo4j' | 'postgresql';
  // Neo4j
  labels?: string[];
  relationshipTypes?: string[];
  nodeProperties?: Record<string, PropertyDef[]>;  // label → properties
  relProperties?: Record<string, PropertyDef[]>;    // relType → properties
  // PostgreSQL
  tables?: TableDef[];
}

export interface PropertyDef { name: string; type: string; }
export interface TableDef { name: string; columns: ColumnDef[]; }
export interface ColumnDef { name: string; type: string; nullable: boolean; }
```

#### 3. Schema fetched on connector save
When a connection is created or updated via the API, trigger schema fetch and store result.

#### 4. Schema API endpoint
```
GET /api/connections/[id]/schema → DatabaseSchema
```

#### 5. Schema Zustand store in the app
```typescript
// app/src/stores/schema-store.ts
interface SchemaState {
  schemas: Record<string, DatabaseSchema>; // connectionId → schema
  fetchSchema: (connectionId: string) => Promise<void>;
  getSchema: (connectionId: string) => DatabaseSchema | null;
}
```

#### 6. React Query hook
```typescript
// app/src/hooks/use-schema.ts
export function useConnectionSchema(connectionId: string | null) {
  return useQuery<DatabaseSchema>({
    queryKey: ['connection-schema', connectionId],
    queryFn: () => fetch(`/api/connections/${connectionId}/schema`).then(r => r.json()),
    enabled: !!connectionId,
    staleTime: 10 * 60 * 1000, // 10 min
  });
}
```

### Files to create/modify
| File | Action | Description |
|------|--------|-------------|
| `connection/src/schema/schema-manager.ts` | Create | Abstract schema manager interface |
| `connection/src/schema/neo4j-schema.ts` | Create | Neo4j schema fetcher |
| `connection/src/schema/pg-schema.ts` | Create | PostgreSQL schema fetcher |
| `connection/src/schema/types.ts` | Create | `DatabaseSchema`, `PropertyDef`, `TableDef`, `ColumnDef` |
| `connection/src/index.ts` | Modify | Export schema manager |
| `app/src/stores/schema-store.ts` | Create | Zustand store for schemas |
| `app/src/hooks/use-schema.ts` | Create | React Query hook |
| `app/src/app/api/connections/[id]/schema/route.ts` | Create | Schema API endpoint |
| `app/src/app/api/connections/route.ts` | Modify | Trigger schema fetch on connection create |
| `app/src/app/api/connections/[id]/route.ts` | Modify | Trigger schema fetch on connection update |

### Depends on
B1, B2 (connectors must work first)

### Acceptance criteria
- [ ] Schema manager interface defined in connection library
- [ ] Neo4j schema fetcher returns labels, relationship types, properties
- [ ] PostgreSQL schema fetcher returns tables, columns, data types
- [ ] Schema fetched automatically on connection save
- [ ] `GET /api/connections/[id]/schema` returns normalized schema
- [ ] Schema Zustand store caches schemas per connection
- [ ] `useConnectionSchema` hook works with 10min stale time and manual refresh

---

## F2. 🚀 Dashboard Pages / Tabs
> **Effort: ~6–8 hours** (data model migration + store changes + tab bar UI + page CRUD + backward compat)

### Context
Dashboards are flat — one page of widgets. Complex dashboards need multiple pages/tabs.

### Data model change

**Old format (v1):**
```json
{ "widgets": [...], "gridLayout": [...] }
```

**New format (v2):**
```json
{
  "version": 2,
  "pages": [
    { "id": "page-1", "title": "Overview", "widgets": [...], "gridLayout": [...] },
    { "id": "page-2", "title": "Details", "widgets": [...], "gridLayout": [...] }
  ]
}
```

**Migration function** (auto-applied on load):
```typescript
function migrateLayout(layout: unknown): DashboardLayoutV2 {
  const raw = layout as Record<string, unknown>;
  if (raw.version === 2 && Array.isArray(raw.pages)) return raw as DashboardLayoutV2;
  const v1 = raw as { widgets?: DashboardWidget[]; gridLayout?: GridLayoutItem[] };
  return {
    version: 2,
    pages: [{
      id: 'page-1',
      title: 'Page 1',
      widgets: v1.widgets ?? [],
      gridLayout: v1.gridLayout ?? [],
    }],
  };
}
```

### Zustand store changes
```typescript
interface DashboardState {
  layout: DashboardLayoutV2;
  activePageIndex: number;
  setActivePage: (index: number) => void;
  addPage: (title: string) => void;
  removePage: (pageId: string) => void;
  renamePage: (pageId: string, title: string) => void;
  // All widget methods operate on the active page
}
```

### UI
- Tab bar between toolbar and grid
- View mode: tabs are clickable to switch pages
- Edit mode: tabs are clickable + [+] button to add page, right-click/context menu for rename/delete
- Active page persists during session

### Files to create/modify
| File | Action | Description |
|------|--------|-------------|
| `app/src/lib/db/schema.ts` | Modify | Update `DashboardLayout` type, add `DashboardPage` |
| `app/src/stores/dashboard-store.ts` | Modify | Add page management, `activePageIndex` |
| `app/src/components/dashboard-container.tsx` | Modify | Render only active page's widgets |
| `app/src/components/page-tabs.tsx` | Create | Reusable tab bar component |
| `app/src/app/(dashboard)/[id]/page.tsx` | Modify | Add tab bar (view mode) |
| `app/src/app/(dashboard)/[id]/edit/page.tsx` | Modify | Add tab bar + page CRUD (edit mode) |

### Acceptance criteria
- [ ] Dashboards support multiple pages
- [ ] Tab bar visible in both view and edit modes
- [ ] Add, rename, delete pages in edit mode
- [ ] Existing v1 dashboards auto-migrate to single-page v2
- [ ] Widgets are scoped to their page
- [ ] Active page persists during view session

---

## F3. 🚀 Parameter Selectors — Rework & Expand
> **Effort: ~14–18 hours** (8 widget types + parameter store + parameter bar + re-query logic + cascading logic + editor config UI + tests)

### Context
Current parameter implementation requires click-actions on charts, which is unintuitive. Parameters should be standalone selector widgets.

### Parameter types (exactly 8)

| Type | `paramType` value | DB dependency | Description |
|------|-------------------|:---:|-------------|
| **Plain Text** | `text` | No | Free text input. User types any value, it becomes the parameter. No DB query involved. |
| **Param Selector** | `select` | Yes | Single-select dropdown. Seeded from a DB query that must return `label` and `value` columns. Type-to-search filtering on the client. Max 5 visible options, scrollable for the rest. |
| **Param Multi-Selector** | `multi-select` | Yes | Same as above, but allows selecting multiple values. Downstream queries receive an array (Cypher `IN $param`, SQL `= ANY($param)`). |
| **Date Picker** | `date` | No | Single date selection. Parameter stored as ISO date string (`2026-02-18`). |
| **Date Range Picker** | `date-range` | No | Two-date selection (from / to). Sets **two parameters**: `$param_from` and `$param_to`. Downstream queries use both for range filtering. |
| **Relative Date Presets** | `date-relative` | No | Preset buttons: "Today", "Last 7 days", "Last 30 days", "This month", "This quarter", "This year", plus custom option. Auto-calculates the actual from/to dates at query time. Sets `$param_from` and `$param_to` like Date Range Picker. Can also be a mode toggle on the Date Range Picker widget. |
| **Number Range Slider** | `number-range` | Optional | Min/max slider for numeric filtering. Sets **two parameters**: `$param_min` and `$param_max`. Slider bounds can be hardcoded in settings (e.g., 0–1000) or fetched from a DB query (`SELECT MIN(salary), MAX(salary) FROM employees`). |
| **Cascading Selector** | `cascading-select` | Yes | A param selector whose seed query **references another parameter**. Creates parent→child relationships (e.g., Country→City). When the parent parameter changes, the child re-fetches its options. No new UI — same dropdown as Param Selector, but the seed query contains `$param` references that trigger re-evaluation. |

### Widget settings for parameter selectors
```typescript
interface ParameterSelectSettings {
  title?: string;
  parameterName: string;             // e.g., "actor_name"
  paramType: 'text' | 'select' | 'multi-select' | 'date' | 'date-range' | 'date-relative' | 'number-range' | 'cascading-select';
  // For select / multi-select / cascading-select only:
  connectionId?: string;             // which DB to query
  seedQuery?: string;                // must return `label` and `value` columns
  maxFetchedRows?: number;           // default 500
  // For number-range only:
  min?: number;                      // hardcoded min (optional if boundsQuery provided)
  max?: number;                      // hardcoded max (optional if boundsQuery provided)
  step?: number;                     // slider step (default 1)
  boundsQuery?: string;              // query returning min/max from DB (optional)
  // For date-relative only:
  presets?: string[];                // e.g., ["today", "last_7_days", "last_30_days", "this_month", "this_quarter", "this_year"]
}
```

### Selector / Multi-Selector behavior
- Seed query runs on mount, results cached
- Type-to-search filters the cached results on the client (no re-query)
- Dropdown shows max 5 visible rows, rest scrollable
- If result set > `maxFetchedRows`, cap at that limit
- Debounce search input: 300ms

### Date Range Picker naming
- If `parameterName` is `release_date`, it sets:
    - `$release_date_from` (start date)
    - `$release_date_to` (end date)
- Same naming convention applies to **Relative Date Presets** (`date-relative`): the preset auto-calculates the actual dates and sets the same `_from` / `_to` parameters

### Relative Date Presets behavior
- Shows a row of preset buttons (e.g., "Last 7 days", "This month") plus a "Custom" option that opens a date range picker
- When a preset is selected, `$param_from` and `$param_to` are calculated at query time relative to `now()`
- Presets are configurable in settings; default set: `["today", "last_7_days", "last_30_days", "this_month", "this_quarter", "this_year"]`

### Number Range Slider behavior
- Renders a dual-handle slider with min/max values
- If `parameterName` is `salary`, sets `$salary_min` and `$salary_max`
- Bounds can be hardcoded (`min`/`max` in settings) or fetched from a query (`boundsQuery` returning a single row with `min` and `max` columns)
- If `boundsQuery` provided, runs on mount to determine slider bounds
- `step` defaults to 1; configurable for decimal values

### Cascading Selector behavior
- Works exactly like a Param Selector, but its `seedQuery` contains `$param` references to other parameters
- When the parent parameter changes, the cascading selector **re-runs its seed query** to fetch updated options
- If the parent parameter is cleared, the cascading selector shows all options (seed query runs without the filter)
- Supports multiple levels of chaining (Country → State → City)
- No special UI needed — same dropdown as Param Selector, the only difference is reactive re-fetching

**Example: Neo4j — Genre → Movie**

| Widget | Type | Seed Query | Sets |
|---|---|---|---|
| Genre | `select` | `MATCH (g:Genre) RETURN g.name AS label, g.name AS value` | `$genre` |
| Movie | `cascading-select` | `MATCH (m:Movie)-[:IN_GENRE]->(g:Genre {name: $genre}) RETURN m.title AS label, m.title AS value` | `$movie` |

User selects "Sci-Fi" → `$genre = "Sci-Fi"` → Movie dropdown re-fetches → shows only Sci-Fi movies (The Matrix, Interstellar, Blade Runner…). User changes to "Comedy" → Movie dropdown re-fetches → shows only comedies.

**Example: PostgreSQL — Country → State → City (3 levels)**

| Widget | Type | Seed Query | Sets |
|---|---|---|---|
| Country | `select` | `SELECT DISTINCT country AS label, country AS value FROM locations` | `$country` |
| State | `cascading-select` | `SELECT DISTINCT state AS label, state AS value FROM locations WHERE country = $country` | `$state` |
| City | `cascading-select` | `SELECT DISTINCT city AS label, city AS value FROM locations WHERE state = $state` | `$city` |

Selecting "Italy" → State shows only Italian regions → selecting "Lazio" → City shows only cities in Lazio.

### Parameter store (Zustand)
```typescript
// app/src/stores/parameter-store.ts
interface ParameterState {
  parameters: Record<string, unknown>;
  setParameter: (name: string, value: unknown) => void;
  clearParameter: (name: string) => void;
  clearAll: () => void;
}
```

### Parameter bar UI
- `ParameterBar` component sits above the dashboard grid
- Shows active parameters as tags with dismiss (X) buttons
- Dismissing clears the parameter and triggers re-query on affected widgets

### Re-query on parameter change
```typescript
// In useWidgetQuery:
const params = useParameterStore(s => s.parameters);
const relevantParams = filterRelevantParams(widget.query, params);
return useQuery({
  queryKey: ['widget-query', widget.connectionId, widget.query, relevantParams],
  // ...
});
```

### Files to create/modify
| File | Action | Description |
|------|--------|-------------|
| `app/src/stores/parameter-store.ts` | Create | Zustand parameter store |
| `app/src/components/parameter-bar.tsx` | Create | Parameter bar with active filter tags |
| `app/src/components/parameter-widgets/text-input.tsx` | Create | Plain text parameter |
| `app/src/components/parameter-widgets/param-selector.tsx` | Create | Single-select dropdown |
| `app/src/components/parameter-widgets/param-multi-selector.tsx` | Create | Multi-select dropdown |
| `app/src/components/parameter-widgets/date-picker.tsx` | Create | Date picker |
| `app/src/components/parameter-widgets/date-range-picker.tsx` | Create | Date range picker |
| `app/src/components/parameter-widgets/date-relative-picker.tsx` | Create | Relative date presets |
| `app/src/components/parameter-widgets/number-range-slider.tsx` | Create | Number range slider |
| `app/src/components/parameter-widgets/cascading-selector.tsx` | Create | Cascading (chained) selector |
| `app/src/components/card-container.tsx` | Modify | Add `parameter-select` rendering case |
| `app/src/lib/chart-registry.ts` | Modify | Add `parameter-select` type |
| `app/src/hooks/use-widget-query.ts` | Modify | Include parameters in query key |
| `app/src/components/dashboard-container.tsx` | Modify | Add parameter bar above grid |
| `app/src/components/widget-editor-modal.tsx` | Modify | Add parameter config UI when `chartType === 'parameter-select'` |

### Depends on
F1 (schema store — for seed query authoring UX, not strictly required for core functionality)

### Acceptance criteria
- [ ] All 8 parameter types render and function correctly
- [ ] Plain Text: sets parameter on input change
- [ ] Param Selector: seed query runs, dropdown shows label/value, type-to-search works
- [ ] Param Multi-Selector: multiple selections stored as array
- [ ] Date Picker: sets ISO date string parameter
- [ ] Date Range Picker: sets `$param_from` and `$param_to`
- [ ] Relative Date Presets: preset buttons calculate from/to dates relative to now; custom option opens date range picker
- [ ] Number Range Slider: dual-handle slider sets `$param_min` and `$param_max`; bounds from settings or query
- [ ] Cascading Selector: re-fetches options when parent parameter changes; supports multi-level chaining
- [ ] Parameter bar shows active parameters with dismiss buttons
- [ ] Dismissing a parameter clears it and re-queries affected widgets
- [ ] Widgets re-query automatically when referenced parameters change
- [ ] Parameter configuration UI works in widget editor modal

---

## F4. 🚀 Dashboard Export / Import
> **Effort: ~8–10 hours** (export API + import API + connection mapping modal + NeoDash converter + UI buttons + tests)

### Context
No way to back up, share, or migrate dashboards. Connection IDs are instance-specific UUIDs.

### Export format
```json
{
  "format": "neoboard",
  "version": 1,
  "exportedAt": "2026-02-17T12:00:00Z",
  "dashboard": {
    "name": "Movie Analytics",
    "description": "...",
    "isPublic": true,
    "layoutJson": { /* v2 format with pages */ }
  },
  "connections": [
    { "ref": "movies-neo4j", "name": "Movies Graph", "type": "neo4j" }
  ]
}
```

- Widgets use `connectionRef` (human-readable slug) instead of `connectionId` (UUID)
- No credentials in the export
- Pretty-printed JSON

### Import flow
1. User uploads `.json` file
2. App detects format: NeoBoard native or NeoDash (auto-convert)
3. **Connection mapping modal**: shows required connections, user maps to their own
4. Dropdowns filter by matching DB type
5. "Skip Mapping" option: imports with unmapped widgets (user assigns connections later)
6. `POST /api/dashboards/import` creates the dashboard

### NeoDash format detection & conversion
```typescript
function isNeoDashFormat(json: unknown): boolean {
  return json?.version?.startsWith('2.') && Array.isArray(json?.pages);
}
```
Type mapping: see TASK_03 conversion table (bar→bar, line→line, value→single-value, etc.)

### Files to create/modify
| File | Action | Description |
|------|--------|-------------|
| `app/src/app/api/dashboards/[id]/export/route.ts` | Create | Export endpoint |
| `app/src/app/api/dashboards/import/route.ts` | Create | Import endpoint |
| `app/src/components/import-dashboard-modal.tsx` | Create | Connection mapping modal |
| `app/src/lib/dashboard-converter.ts` | Create | NeoDash → NeoBoard converter |
| `app/src/lib/export-types.ts` | Create | Export format types |
| `app/src/app/(dashboard)/page.tsx` | Modify | Add Import button |
| `app/src/app/(dashboard)/[id]/page.tsx` | Modify | Add Export button to toolbar |

### Depends on
F2 (pages must exist in export format)

### Acceptance criteria
- [ ] Export downloads a `.json` file, human-readable, no credentials or UUIDs
- [ ] Import parses JSON, shows connection mapping modal
- [ ] Mapping dropdowns filter by DB type
- [ ] Import with mapping creates a working dashboard
- [ ] Import with "Skip Mapping" creates dashboard with unmapped widgets
- [ ] NeoDash format auto-detected and converted
- [ ] Invalid/corrupt JSON shows clear error

---

## F5. 🔧 Connector-First Widget Creation Flow
> **Effort: ~3–4 hours** (chart registry changes + editor modal reorder + connection dropdown on existing widgets)

### Context
Currently chart type is selected independently of connector. Some charts don't work for some DB types.

### New flow
1. **Step 1**: Select connector (dropdown of user's connections)
2. **Step 2**: Show only compatible chart types for that connector's DB type

### Compatibility matrix (add to chart registry)
```typescript
// In chart-registry.ts, per chart type:
compatibleConnectors: ['neo4j', 'postgresql']  // or just ['neo4j']
```

| Chart Type | Neo4j | PostgreSQL |
|------------|:-----:|:----------:|
| bar | ✅ | ✅ |
| line | ✅ | ✅ |
| pie | ✅ | ✅ |
| table | ✅ | ✅ |
| single-value | ✅ | ✅ |
| json | ✅ | ✅ |
| graph | ✅ | ❌ |
| map | ✅ | ✅ |
| form | ✅ | ✅ |
| parameter-select | ✅ | ✅ |

### Also: change connector on existing widget
- Add a "Connection" dropdown in the widget editor modal (chart settings area)
- Changing connection may invalidate the query — show a warning

### Files to modify
| File | Action | Description |
|------|--------|-------------|
| `app/src/lib/chart-registry.ts` | Modify | Add `compatibleConnectors` per chart type |
| `app/src/components/widget-editor-modal.tsx` | Modify | Reorder steps: connector first, filter chart types, add connection dropdown for existing widgets |

### Depends on
F1 (schema store — to show schema-aware info per connector)

### Acceptance criteria
- [ ] Widget creation: select connector → see only compatible chart types
- [ ] Graph chart not shown for PostgreSQL connections
- [ ] Existing widgets can change their connector in settings
- [ ] Warning shown when changing connector may invalidate query

---
---

# P2 — Medium Priority Features

---

## F6. 🔧 Code Editor with Syntax Highlighting & Autocompletion
> **Effort: ~8–10 hours** (CodeMirror integration + Cypher/SQL language setup + schema browser panel + autocompletion wiring + tests)

### Context
Query editing uses a plain `<Textarea>`. No syntax highlighting, completion, or schema awareness.

### Implementation
- Replace `<Textarea>` in `WidgetEditorModal` with **CodeMirror 6**
- Language auto-detected from connection type: `neo4j` → Cypher, `postgresql` → SQL
- Packages: `codemirror`, `@codemirror/lang-sql`, `codemirror-lang-cypher`, `@codemirror/autocomplete`, `@codemirror/theme-one-dark`
- Schema browser panel (collapsible, left side of editor): shows labels/tables/columns from schema store (F1)
- Click schema item → inserts at cursor position
- Autocompletion: suggests schema items while typing

### Files to create/modify
| File | Action | Description |
|------|--------|-------------|
| `component/src/components/composed/query-editor.tsx` | Modify/Rewrite | CodeMirror 6 with language prop and schema completion |
| `component/package.json` | Modify | Add CodeMirror dependencies |
| `app/src/components/widget-editor-modal.tsx` | Modify | Replace Textarea with QueryEditor + schema panel |
| `app/src/components/schema-browser.tsx` | Create | Collapsible schema tree with click-to-insert |

### Depends on
F1 (schema store)

### Acceptance criteria
- [ ] Cypher queries have syntax highlighting
- [ ] SQL queries have syntax highlighting
- [ ] Language auto-detected from connection type
- [ ] Schema browser shows labels/relationships or tables/columns
- [ ] Clicking schema item inserts at cursor
- [ ] Basic autocompletion from schema
- [ ] Editor preserves undo/redo

---

## F7. 🚀 Chart Repository
> **Effort: ~10–14 hours** (new DB table + CRUD API + repository page + save-from-card action + import-from-repo flow + tests; most speculative task)

### Context
Users want to design charts once and reuse across dashboards. New concept — not in original task docs.

### Data model
```typescript
// New DB table: saved_charts
savedCharts = pgTable("saved_chart", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  userId: text("userId").notNull().references(() => users.id),
  name: text("name").notNull(),
  chartType: text("chartType").notNull(),
  connectionId: text("connectionId").references(() => connections.id),
  query: text("query").notNull(),
  settings: jsonb("settings").$type<Record<string, unknown>>(),
  gridW: integer("gridW").default(6),
  gridH: integer("gridH").default(4),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});
```

### Features
1. **Save to Repository**: action in the widget card dropdown → copies widget config to `saved_charts`
2. **Chart Repository page**: new tab/page in the project
    - Browse saved charts (card grid)
    - Preview, edit, delete
    - "Add to Dashboard" → inserts a copy into the current dashboard
3. **Import from repository**: alternative to "new widget" during widget creation

### API
```
GET    /api/charts              — list user's saved charts
POST   /api/charts              — save a chart
GET    /api/charts/[id]         — get a saved chart
PUT    /api/charts/[id]         — update
DELETE /api/charts/[id]         — delete
```

### Files to create/modify
| File | Action | Description |
|------|--------|-------------|
| `app/src/lib/db/schema.ts` | Modify | Add `savedCharts` table |
| `docker/postgres/init.sql` | Modify | Add table DDL |
| `app/src/app/api/charts/route.ts` | Create | List + create |
| `app/src/app/api/charts/[id]/route.ts` | Create | Get + update + delete |
| `app/src/app/(dashboard)/charts/page.tsx` | Create | Chart repository page |
| `app/src/components/card-container.tsx` | Modify | Add "Save to Repository" in dropdown |
| `app/src/components/widget-editor-modal.tsx` | Modify | Add "Import from Repository" option |

### Acceptance criteria
- [ ] "Save to Repository" action on widget cards
- [ ] Chart Repository page: browse, preview, edit, delete
- [ ] "Add to Dashboard" inserts chart copy into current dashboard
- [ ] Saved charts persist across sessions
- [ ] Can import from repository during widget creation

---

## F8. 🚀 Bulk Connection Import
> **Effort: ~3–4 hours** (import format definition + API endpoint + file picker UI + validation feedback modal)

### Context
Setting up many connections one-by-one is tedious.

### Import format
```json
{
  "connections": [
    {
      "name": "Movies Neo4j",
      "type": "neo4j",
      "host": "localhost",
      "port": 7687,
      "username": "neo4j",
      "password": "password"
    },
    {
      "name": "Analytics PG",
      "type": "postgresql",
      "host": "localhost",
      "port": 5432,
      "database": "analytics",
      "username": "postgres",
      "password": "password"
    }
  ]
}
```

### UI
- "Import Connections" button on connections page
- File drop zone or file picker (`.json`)
- After parsing: show a table with each connection's name, type, and status (pending/success/error)
- Validate and save each connection, show per-connection result
- Credentials encrypted on save (same flow as single-connection)

### Files to create/modify
| File | Action | Description |
|------|--------|-------------|
| `app/src/app/api/connections/import/route.ts` | Create | Bulk import endpoint |
| `app/src/app/(dashboard)/connections/page.tsx` | Modify | Add Import button + file picker |
| `app/src/components/bulk-import-modal.tsx` | Create | Results table modal |

### Acceptance criteria
- [ ] JSON file with multiple connections can be uploaded
- [ ] Each connection validated individually
- [ ] Per-connection success/error feedback
- [ ] Credentials encrypted on save
- [ ] Schema auto-fetched for each successful connection (if F1 is done)

---

## F9. 🔧 Connector UX Improvements
> **Effort: ~4–5 hours** (type-first creation flow + dropdown menus on cards + error tooltips)

### 9a. Icon selector for connection types
- Connection creation flow: **select type first** (Neo4j / PostgreSQL) with icons
- Then show type-specific form fields

### 9b. Connector card actions
Replace flat buttons with a dropdown menu on each connection card: **Edit, Delete, Duplicate, Test**

### 9c. Error visibility
- When connection test fails, show error message in a tooltip on hover over the error status dot
- Store error messages alongside test status in component state
- Widget query errors: show connection name + retry button

### Files to modify
| File | Action | Description |
|------|--------|-------------|
| `app/src/app/(dashboard)/connections/page.tsx` | Modify | Type-first flow, dropdown menu, error messages |
| `component/src/components/composed/connection-card.tsx` | Modify | Add dropdown menu, `errorMessage` prop, tooltip |
| `component/src/components/composed/connection-status.tsx` | Modify | Add tooltip for error details |

### Acceptance criteria
- [ ] Connection creation starts with type selection (with icons)
- [ ] Connection cards have dropdown: Edit, Delete, Duplicate, Test
- [ ] Failed connection tests show error in tooltip
- [ ] Error display doesn't clutter UI when healthy

---

## F10. 🔧 On-the-fly Column Mapping for Charts
> **Effort: ~5–6 hours** (mapping overlay UI + transform logic changes + persistence + per-chart-type support)

### Context
Changing X/Y axis columns requires editing the query or settings modal. Should be faster.

### Implementation
- Lightweight **column mapping overlay** on the chart card (outside of settings modal)
- For bar, line, scatter, pie: show dropdowns for X axis, Y axis, Group by / Series
- Dropdowns populated from query result column names
- Changing a mapping re-renders instantly (no re-query, just re-transform)
- Persist in `widget.settings.columnMapping`

### Files to modify
| File | Action | Description |
|------|--------|-------------|
| `app/src/components/card-container.tsx` | Modify | Add column mapping overlay UI |
| `app/src/lib/chart-registry.ts` | Modify | Transforms read from `columnMapping` |
| `component/src/charts/bar-chart.tsx` | Modify | Accept dynamic axis keys |
| `component/src/charts/line-chart.tsx` | Modify | Accept dynamic axis keys |
| `component/src/charts/pie-chart.tsx` | Modify | Accept dynamic name/value keys |

### Acceptance criteria
- [ ] Column mapping dropdowns visible on applicable chart cards
- [ ] Changing mapping re-renders chart instantly
- [ ] Mapping persists in widget settings
- [ ] Works for bar, line, pie (extend to others later)

---

## F11. 🔧 Full Chart Configuration Options
> **Effort: ~4–6 hours for analysis doc, ~16–24 hours for implementation** (analysis is a prerequisite gate; implementation covers all 8 chart types, settings panels, shared UI controls, and component library changes)

### Context
Charts expose only a subset of possible configuration options. Every chart type should surface all meaningful options.

### Required options per chart type

| Chart Type | Required Options |
|------------|-----------------|
| **Bar** | Orientation (vertical/horizontal), stacked/grouped, bar width, bar gap, axis labels, axis range (min/max), legend position, show values on bars, grid lines, tooltip format, colors |
| **Line** | Smooth vs stepped, show points/markers, point size, line width, area fill (on/off + opacity), axis labels, axis range, dual Y-axis, legend position, grid lines, tooltip format |
| **Pie** | Donut mode (inner radius), label position (inside/outside/none), show percentages, sort slices, rose mode, legend position, colors |
| **Table** | Column visibility, column order, column width, sortable columns, text alignment, row striping, header style, number formatting, date formatting, cell truncation/wrap |
| **Single Value** | Font size, prefix/suffix text, number formatting (decimals, thousands separator), trend indicator (up/down arrow), icon, color thresholds |
| **Graph** | Node size (fixed or property-mapped), node color (by label or property), edge width, edge color, layout algorithm (force/hierarchical/circular), show labels, label property, zoom controls, physics settings |
| **Map** | Tile layer (OpenStreetMap/CartoDB/satellite), default zoom, default center, marker size, marker color (fixed or property-mapped), cluster markers, popup content template |
| **JSON Viewer** | Expand depth, theme, font size, copy button, search/filter |

### ⚠️ Pre-requisite: Analysis document (Claude Code–ready)

**Before any implementation**, produce a structured analysis document following this exact format so it can be passed directly to Claude Code as an implementation spec:

```
# Chart Configuration Options — Implementation Spec

## 1. Shared Options (apply to all/most chart types)
For each option:
- **key**: `chartOptions.{key}` path in widget settings
- **label**: display name in the UI
- **control**: UI control type (toggle | slider | dropdown | colorPicker | textInput | numberInput)
- **type**: TypeScript type of the value
- **default**: default value
- **validation**: constraints (min/max, enum values, regex)
- **applies_to**: list of chart types that use this option

## 2. Per-Chart-Type Options
For each chart type (bar, line, pie, table, singleValue, graph, map, json):

### `<chartType>`
#### Section: "<Section Name>" (e.g., "Axes", "Legend", "Style")
| Key | Label | Control | Type | Default | Validation | Notes |
|-----|-------|---------|------|---------|------------|-------|
| ... | ...   | ...     | ...  | ...     | ...        | ...   |

## 3. TypeScript Interfaces
- Full `ChartOptions` type definition per chart type
- Shared `CommonChartOptions` base interface
- Union type: `ChartTypeOptions`

## 4. Settings Panel Structure
For each chart type:
- Ordered list of collapsible sections
- Which sections are open by default
- Section → option keys mapping

## 5. Component Library Changes
For each chart component file:
- File path
- Props to add/modify
- How each option maps to ECharts config (exact ECharts option path)
  e.g.: `showGridLines` → `option.xAxis.splitLine.show`

## 6. Shared UI Components Needed
- List of reusable settings controls (ColorPickerField, SliderField, AxisRangeInput, etc.)
- Props interface for each
```

This document must be complete and self-contained — Claude Code should be able to implement every settings panel and chart component change from this spec alone, with no ambiguity. **Review and approve before implementation begins.**

### Acceptance criteria
- [ ] Analysis document produced, reviewed, and approved
- [ ] All options from the table above are exposed in the chart settings panel
- [ ] Options organized into collapsible sections
- [ ] Sensible defaults for every option
- [ ] Stored in `widget.settings.chartOptions`
- [ ] Each chart component reads and applies its options

---

## F12. 🔧 Table Chart: Dynamic Pagination
> **Effort: ~2–3 hours** (pagination component + dynamic page size calculation + settings toggle)

### Context
Table chart shows all rows at once.

### Implementation
- Pagination enabled by default on all table charts
- Page size calculated dynamically: `Math.floor((containerHeight - headerHeight) / rowHeight)`
- Page controls at bottom: prev / next / page number
- Option to disable in chart settings

_(Pagination toggle is also part of F11 table options — this covers the dynamic sizing logic.)_

### Files to modify
| File | Action | Description |
|------|--------|-------------|
| `component/src/charts/data-grid.tsx` (or table component) | Modify | Add pagination with dynamic page size |
| `app/src/components/card-container.tsx` | Modify | Pass container dimensions to table |

### Acceptance criteria
- [ ] Table chart paginates by default
- [ ] Page size adapts to container height
- [ ] Page controls functional (prev/next/page number)
- [ ] Can disable pagination in settings

---

## F13. 🚀 Form Chart Type
> **Effort: ~8–10 hours** (form renderer component + field builder UI + write mode API + access mode in connection module + tests)

### Context
NeoBoard is read-only. Form charts enable write operations.

### Widget settings
```typescript
interface FormWidgetSettings {
  title?: string;
  submitQuery: string;       // write query with $param_name syntax
  successMessage?: string;
  clearOnSubmit?: boolean;
  fields: FormFieldDef[];
}

interface FormFieldDef {
  name: string;              // parameter name in query
  label: string;
  type: 'text' | 'number' | 'date' | 'datetime' | 'select' | 'textarea' | 'checkbox';
  defaultValue?: unknown;
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];   // static select options
  optionsQuery?: string;                           // dynamic select options
  pattern?: string;                                // validation regex
}
```

### Query API change
```typescript
// POST /api/query body:
{ connectionId, query, params?, mode?: 'read' | 'write' }
```

### Files to create/modify
| File | Action | Description |
|------|--------|-------------|
| `component/src/components/composed/form-chart.tsx` | Create | Form renderer |
| `app/src/lib/chart-registry.ts` | Modify | Add `form` type |
| `app/src/components/card-container.tsx` | Modify | Add form rendering case |
| `app/src/components/widget-editor-modal.tsx` | Modify | Form field builder UI |
| `app/src/app/api/query/route.ts` | Modify | Accept `mode` parameter |
| `app/src/lib/query-executor.ts` | Modify | Pass access mode to connection |

### Depends on
F1 (schema for dynamic select options)

### Acceptance criteria
- [ ] Form chart type in chart picker
- [ ] Fields render correctly (text, number, date, select, textarea, checkbox)
- [ ] Submit executes write query with parameterized values
- [ ] Success/error feedback shown
- [ ] Form clears on success (when configured)
- [ ] Works for both Neo4j and PostgreSQL
- [ ] Dynamic select options work

---
---

# P3 — Nice-to-Have / Polish

---

## F14. 🔧 UX Design System & Color Palette
> **Effort: ~3–4 hours**
> _TASK_05_

- Custom "Deep Ocean" color palette (light + dark modes)
- 10-color chart palette (colorblind-safe)
- ECharts theme registration (`neoboard-light`, `neoboard-dark`)
- Storybook theme alignment

---

## F15. 🔧 Dashboard Metadata Display
> **Effort: ~2–3 hours**
> _TASK_06B_

- Add `updatedBy` column to `dashboards` table
- Show "Last updated X ago by Y" on dashboard cards and viewer
- Widget count on dashboard cards

---

## F16. 🚀 Additional Chart Types
> **Effort: ~2–3 hours per chart type** (ECharts-native, mostly config + registry + transform)
> _TASK_03 gap analysis_

ECharts-native, moderate effort each:
- Gauge, Sankey, Sunburst, Radar, Treemap
- Choropleth Map (needs GeoJSON — higher effort)

---

## F17. 🚀 Markdown & iFrame Widget Types
> **Effort: ~2–3 hours** (two simple widget types, minimal logic)
> _TASK_03_

- **Markdown**: renders static text/instructions
- **iFrame**: embeds external URL

---

## F18. 🔧 Auto-refresh
> **Effort: ~2–3 hours** (interval config in settings + `refetchInterval` in React Query + UI toggle)
> _TASK_03_

- Periodic query re-execution on configurable interval (e.g., every 30s)
- Per-widget or dashboard-level toggle

---

## F19. 🔧 E2E Test Coverage
> **Effort: ~6–8 hours** (test infrastructure setup + 5–6 critical flow tests)
> _List #3_

- Playwright/Cypress tests covering:
    - Connection test flow
    - Widget preview in editor
    - Chart rendering with live data
    - Parameter interaction
    - Export/import round-trip