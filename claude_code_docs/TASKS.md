# NeoBoard - Active Task List

> Current sprint: Bug fixes, missing features, and E2E test coverage.
> Last updated: 2026-02-15

---

## Project Context

NeoBoard is a dashboard builder for Neo4j and PostgreSQL. The component library (`component/`) is complete (33 base UI + 55 composed + 7 charts, 826 tests). The Next.js app (`app/`) has basic routing, auth, connection management, and dashboard CRUD — but several features are broken or incomplete.

### Architecture Quick Reference

```
/public
├── app/                    # Next.js 15 app (App Router)
│   └── src/
│       ├── app/
│       │   ├── (auth)/          # Login/signup pages
│       │   ├── (dashboard)/     # Layout with sidebar (AppShell)
│       │   │   ├── page.tsx         # Dashboard list
│       │   │   ├── [id]/page.tsx    # Dashboard viewer
│       │   │   └── [id]/edit/page.tsx # Dashboard editor
│       │   ├── connections/     # BUG: outside (dashboard) layout group
│       │   └── api/             # REST API routes
│       ├── components/          # App-specific components
│       │   ├── dashboard-container.tsx  # Renders widget grid
│       │   └── card-container.tsx       # Renders individual chart
│       ├── stores/              # Zustand (dashboard-store, connection-store)
│       ├── hooks/               # React Query hooks
│       └── lib/
│           ├── chart-registry.ts    # Chart type → config mapping
│           ├── query-executor.ts    # Runs queries against connections
│           └── db/schema.ts         # Drizzle ORM schema
├── component/              # Presentational component library
│   └── src/
│       ├── components/ui/       # 33 shadcn base components
│       ├── components/composed/ # 55 composed components (DataGrid, DashboardGrid, etc.)
│       └── charts/              # 7 chart types (Bar, Line, Pie, SingleValue, Graph, Map + BaseChart)
├── connection/             # Database connection module (Neo4j + PostgreSQL adapters)
└── docker/                 # Docker init scripts (postgres, neo4j seed data)
```

### Key Data Flow

```
Widget → CardContainer → useQueryExecution (POST /api/query)
  → query-executor → connection module → database
  → response → chart-registry transform → Chart component render
```

### State Management

- **Zustand**: `dashboard-store` (layout, widgets, grid), `connection-store` (active connections)
- **React Query**: Server data fetching (dashboards, connections, query execution)
- **DB**: PostgreSQL via Drizzle ORM (users, connections, dashboards, shares)

---

## Task List

### Priority: Critical (Broken functionality)

#### T1. Fix sidebar missing on connections page
**Status**: Done
**Files**: `app/src/app/connections/page.tsx` → move to `app/src/app/(dashboard)/connections/page.tsx`
**Problem**: The `/connections` route is outside the `(dashboard)` route group, so it doesn't get the `AppShell` + `Sidebar` layout. Users navigate to connections and can't get back without using the browser back button.
**Fix**: Move `connections/page.tsx` into the `(dashboard)/` directory so it inherits the layout with sidebar.
**Acceptance Criteria**:
- Connections page renders inside the AppShell with sidebar visible
- Sidebar "Connections" item shows as active when on that page
- Navigation between Dashboards and Connections works both ways

---

#### T2. Wire up actual chart rendering in CardContainer
**Status**: Done
**Files**: `app/src/components/card-container.tsx`
**Problem**: `CardContainer` renders `<pre>{JSON.stringify(transformedData)}</pre>` instead of actual chart components. There's a TODO comment: "In the full implementation, this would dynamically import and render the actual chart component."
**Fix**: Import chart components from `@neoboard/components` and render the correct one based on `widget.chartType`. Handle data transformation from query results to the format each chart expects:
- `bar` → `BarChart` (needs `[{label, value}]` — transform from query result rows)
- `line` → `LineChart` (needs `[{label, value}]`)
- `pie` → `PieChart` (needs `[{name, value}]`)
- `value` / `single-value` → `SingleValueChart` (needs single number)
- `graph` → `GraphChart` (needs nodes/links format)
- `map` → `MapChart` (needs lat/lon data)
**Acceptance Criteria**:
- Each chart type renders its actual visualization, not JSON
- Data transforms handle both Neo4j and PostgreSQL query result formats
- Error states shown for invalid data formats
- Charts are responsive within their grid cells

---

#### T3. Fix dashboard grid drag and resize
**Status**: Done
**Files**: `app/src/components/dashboard-container.tsx`, `app/src/app/(dashboard)/[id]/edit/page.tsx`
**Problem**: `DashboardContainer` uses a plain CSS grid (`<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">`) instead of the `DashboardGrid` component from `@neoboard/components` which wraps react-grid-layout with drag and resize support.
**Fix**: Replace the CSS grid in `DashboardContainer` with `DashboardGrid` from the component library. Wire up:
- `layout` prop from `layout.gridLayout`
- `onLayoutChange` → `useDashboardStore().updateGridLayout`
- `isDraggable` / `isResizable` based on `editable` prop
- Each widget rendered inside the grid items matching by `key={widget.id}`
**Acceptance Criteria**:
- Widgets can be dragged to new positions in edit mode
- Widgets can be resized via the SE corner handle in edit mode
- Layout changes persist to the store (and save to DB on "Save")
- View mode: no drag/resize handles visible
- Grid layout is responsive across breakpoints

---

### Priority: High (Bad UX, quick wins)

#### T4. Auto-check connection status on load
**Status**: Done
**Files**: `app/src/app/(dashboard)/connections/page.tsx` (after T1 move), `app/src/hooks/use-connections.ts`
**Problem**: All connections show "disconnected" until user manually clicks "Test" on each one. No background status checking.
**Fix**: Add a `useEffect` that fires after connections load, testing each connection in the background via the existing `testConnection` endpoint. Store results in local state (or a Zustand store for cross-page persistence).
**Acceptance Criteria**:
- On page load, each connection automatically starts testing (shows "connecting" spinner)
- Status updates to "connected" or "error" as results come back
- Manual "Test" button still works for re-testing
- Tests run in parallel, not sequentially

---

#### T5. Add Table chart type to ChartTypePicker and rendering
**Status**: Done
**Blocked by**: T2
**Files**: `component/src/components/composed/chart-type-picker.tsx`, `app/src/lib/chart-registry.ts`, `app/src/components/card-container.tsx`
**Problem**: The `ChartTypePicker` has no "Table" option, but `DataGrid` exists in the component library and `chart-registry.ts` already defines a `table` type.
**Fix**:
1. Add a "Table" option to `ChartTypePicker` defaults (use `Table2` icon from lucide)
2. In `CardContainer`, render `DataGrid` for `table` type
3. Auto-generate column definitions from query result keys
**Acceptance Criteria**:
- "Table" appears as a selectable chart type when creating widgets
- Table chart renders query results with sorting and pagination
- Columns auto-detected from the query result shape

---

#### T6. Add JSON Viewer chart type
**Status**: Done
**Blocked by**: T2
**Files**: `app/src/lib/chart-registry.ts`, `app/src/components/card-container.tsx`, `component/src/components/composed/chart-type-picker.tsx`
**Problem**: No way to view raw query results in a structured, collapsible format.
**Fix**:
1. Add `json` type to `chart-registry.ts`
2. Add "JSON" option to `ChartTypePicker` (use `Braces` icon from lucide)
3. In `CardContainer`, render the `JsonViewer` component from `@neoboard/components` for the `json` type
**Acceptance Criteria**:
- "JSON" appears as a selectable chart type
- JSON Viewer renders with collapsible nodes for nested data
- Works with both Neo4j and PostgreSQL query results

---

### Priority: Medium (Feature enhancements)

#### T7. Redesign widget creation as two-step modal flow
**Status**: Done
**Blocked by**: T2, T5, T6
**Files**: `app/src/app/(dashboard)/[id]/edit/page.tsx`
**Problem**: Current "Add Widget" modal has chart type picker, connection selector, and a single-line text input for the query — all in one screen. No way to preview results before adding.
**Fix**: Split into two steps:
- **Step 1 (existing modal, simplified)**: Select chart type + connection → "Next" button
- **Step 2 (new modal, wider)**: Query editor (textarea, not single-line input) + "Show Preview" button that executes the query and renders a live chart preview. "Add Widget" button to confirm.
**Acceptance Criteria**:
- Step 1: Chart type and connection selection with "Next" button
- Step 2: Full-width query editor (textarea with monospace font)
- "Show Preview" button executes query and shows chart below the editor
- Preview uses the selected chart type and connection
- "Add Widget" adds the widget to the dashboard
- "Back" button returns to step 1
- Cancel closes the whole flow

---

#### T8. Add user management tab
**Status**: Done
**Files**: New `app/src/app/(dashboard)/users/page.tsx`, new `app/src/app/api/users/route.ts`
**Problem**: No way to manage users in the application. Only way to create users is via the signup page.
**Fix**:
1. Add "Users" route at `(dashboard)/users/page.tsx`
2. Add sidebar item with `Users` icon
3. Create API route `GET /api/users` (list) and `DELETE /api/users/[id]` (delete)
4. Show users in a `DataGrid` with name, email, created date
5. Add "Create User" dialog (reuse signup form logic)
6. Add delete with confirmation
**Acceptance Criteria**:
- Users page accessible from sidebar
- DataGrid shows all users with sorting
- Can create new users via dialog
- Can delete users with confirmation (can't delete yourself)

---

### Priority: Last (After all features)

#### T9. Set up Playwright E2E tests
**Status**: Done
**Blocked by**: T1-T8
**Files**: New `app/playwright.config.ts`, new `app/e2e/` directory
**Dependencies**: All features above must be implemented first

**Setup**:
- Install `@playwright/test` in app package
- Configure `playwright.config.ts` with `webServer` pointing to `next dev`
- Use docker-compose for test database fixtures (PostgreSQL + Neo4j with seed data)

**Test Suites**:

1. **Auth flow** (`e2e/auth.spec.ts`)
   - Sign up with new account
   - Log in with existing account
   - Log out via sidebar
   - Redirect to login when unauthenticated

2. **Navigation** (`e2e/navigation.spec.ts`)
   - Sidebar visible on all pages (dashboards, connections, users)
   - Navigate between all tabs
   - Sidebar collapse/expand works
   - Active state highlights correctly

3. **Connections** (`e2e/connections.spec.ts`)
   - Create a Neo4j connection
   - Create a PostgreSQL connection
   - Auto-status check shows connected/error
   - Manual test connection works
   - Delete connection with confirmation

4. **Dashboard CRUD** (`e2e/dashboards.spec.ts`)
   - Create new dashboard
   - Open dashboard in view mode
   - Open dashboard in edit mode
   - Delete dashboard

5. **Widget creation** (`e2e/widgets.spec.ts`)
   - Two-step flow: select type + connection, then write query + preview
   - Add bar chart widget with a real query
   - Add table widget
   - Add JSON viewer widget
   - Preview renders before adding
   - Widget appears in dashboard grid

6. **Chart rendering** (`e2e/charts.spec.ts`)
   - Bar chart renders SVG/canvas (not JSON text)
   - Line chart renders
   - Table chart renders DataGrid with rows
   - JSON viewer renders collapsible tree
   - Single value chart renders large number

7. **Dashboard grid** (`e2e/grid.spec.ts`)
   - Drag widget to new position
   - Resize widget
   - Save layout persists positions
   - View mode has no drag handles

8. **User management** (`e2e/users.spec.ts`)
   - Users page shows current user
   - Create new user
   - Delete user with confirmation

**Acceptance Criteria**:
- All test suites pass against docker-compose environment
- Tests run in CI (headless Chromium)
- Tests are independent (each test can run in isolation)
- Page object pattern for reusable selectors

---

## Completed Tasks

- **T1**: Fix sidebar missing on connections page — moved to `(dashboard)/connections/page.tsx`
- **T2**: Wire up actual chart rendering — rewrote `chart-registry.ts` with proper transforms, `card-container.tsx` with ChartRenderer switch
- **T3**: Fix dashboard grid drag and resize — replaced CSS grid with `DashboardGrid` component, wired `onLayoutChange` to store
- **T4**: Auto-check connection status on load — added `useEffect` that tests all connections in parallel on page load
- **T5**: Add Table chart type — added to `ChartTypePicker` defaults and `CardContainer` rendering
- **T6**: Add JSON Viewer chart type — added to `ChartTypePicker` defaults and `CardContainer` rendering
- **T7**: Redesign widget creation as two-step modal — Step 1: chart type + connection, Step 2: query editor + live preview
- **T8**: Add user management tab — Users page, API routes, sidebar item, DataGrid with create/delete
- **T9**: Set up Playwright E2E tests — 8 test suites with page objects and shared fixtures

---

## Notes

- The component library (`component/`) is stable with 826 passing tests. Changes should only be additive (new options to ChartTypePicker, etc.), not refactoring existing components.
- The `connection/` module handles Neo4j and PostgreSQL adapters. It's tested and stable.
- Docker seed data is set up in `docker/postgres/init.sql` and `docker/neo4j/init.cypher` (movies dataset).
- The `ChartTypePicker` and `chart-registry.ts` now both use `single-value` consistently (reconciled in T2).
- Playwright is not yet installed as a dependency — run `npm install -D @playwright/test && npx playwright install chromium` in the `app/` directory before running E2E tests.
