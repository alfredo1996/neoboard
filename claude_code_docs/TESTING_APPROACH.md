# NeoBoard - Testing Approach

Testing strategy: unit tests (Vitest) at all three package levels + full-app E2E tests (Playwright).

---

## Testing Stack

| Tool | Package | Purpose |
|------|---------|---------|
| **Vitest** | `app/` | Unit tests for API routes, hooks, stores, utilities |
| **Vitest** | `component/` | Unit tests for UI components, charts, composed components |
| **Jest (ts-jest)** | `connection/` | Integration tests for DB adapters (needs Docker) |
| **React Testing Library** | `component/` | Component testing utilities |
| **@testing-library/user-event** | `component/` | User interaction simulation |
| **Storybook + Playwright** | `component/` | Visual browser tests |
| **Playwright** | `app/` | E2E tests for the full application |

---

## Testing Layers

```
          /  E2E (Playwright)  \       Full app flows against real DBs
         /──────────────────────\
        / App Unit (Vitest)      \     API routes, hooks, stores, crypto
       /──────────────────────────\
      / Component Unit (Vitest)    \   Individual component behavior
     /──────────────────────────────\
    / Connection Integration (Vitest)\  DB adapters against real databases
   /──────────────────────────────────\
```

---

## 1. App Unit Tests (Vitest)

**Location**: `app/src/**/__tests__/`
**Runner**: Vitest with node environment
**Config**: `app/vitest.config.ts`

### What's Tested
- API routes (connections CRUD, dashboards CRUD, query execution, auth)
- Hooks (use-widget-query parameter extraction/substitution)
- Stores (dashboard-store state management)
- Utilities (query-hash, layout migration, bootstrap, auth session, crypto)

### Commands
```bash
cd app
npm test              # Run all tests
npm run test:coverage # Run with coverage report
```

---

## 2. Component Library Tests (Vitest)

**Location**: `component/src/**/__tests__/`
**Runner**: Vitest with jsdom environment
**Config**: `component/vite.config.ts`

### What's Tested
- All base UI components (shadcn/ui wrappers)
- All composed components (query-editor, chart-settings-panel, etc.)
- All chart components (bar, line, pie, single-value, graph, map)
- Props, events, state changes, edge cases

### Commands
```bash
cd component
npm test              # Run unit tests (jsdom, --project unit)
npm run test:coverage # Run unit tests with coverage report
npm run test:watch    # Watch mode (unit project)
npm run test:storybook # Run Storybook browser tests (Playwright, --project storybook)
```

**Two Vitest projects:**
- `unit` — standard jsdom environment, runs with `npm test` / `npm run test:coverage`
- `storybook` — Playwright browser (Chromium, headless) via `@storybook/addon-vitest`; runs with `npm run test:storybook`; not included in the default `npm test` run or coverage

---

## 3. Connection Integration Tests

**Location**: `connection/src/**/__tests__/`
**Runner**: Vitest/Jest
**Requires**: Docker (PostgreSQL + Neo4j)

### What's Tested
- Neo4j adapter (connection, query execution, schema introspection)
- PostgreSQL adapter (connection, query execution, schema introspection)
- Record parsing and normalization

### Commands
```bash
cd connection
npm test              # Run tests (needs Docker running)
npm run test:coverage # Run with coverage report
```

---

## 4. E2E Tests (Playwright)

**Location**: `app/e2e/`
**Config**: `app/playwright.config.ts`
**Requires**: Docker (PostgreSQL + Neo4j with seed data)

### Setup

```bash
cd app
npm run test:e2e       # Runs all E2E tests (auto-starts testcontainers)
npm run test:e2e:ui    # Interactive Playwright UI mode
```

**Infrastructure**: Uses `testcontainers` to automatically spin up PostgreSQL and Neo4j containers per test run. No manual `docker compose up` needed.

- `e2e/global-setup.ts` — starts containers, seeds data, encrypts connection configs, writes `.env.test`
- `e2e/global-teardown.ts` — stops containers, restores `.env.local`

### Test Suites

| Suite | File | What It Tests |
|-------|------|---------------|
| Auth | `e2e/auth.spec.ts` | Sign up, log in, log out, redirect when unauthenticated |
| Auth States | `e2e/auth-states.spec.ts` | Login error alerts and edge-case auth states |
| Navigation | `e2e/navigation.spec.ts` | Sidebar on all pages, tab switching, collapse/expand |
| Connections | `e2e/connections.spec.ts` | Create, auto-status check, manual test, delete |
| Dashboards | `e2e/dashboards.spec.ts` | Create, view, edit, delete dashboards |
| Dashboard States | `e2e/dashboard-states.spec.ts` | Dashboard viewer uncovered states |
| Empty States | `e2e/empty-states.spec.ts` | Dashboard list empty states, role badges |
| Widgets | `e2e/widgets.spec.ts` | Two-step creation flow, query + preview, add to grid |
| Widget States | `e2e/widget-states.spec.ts` | Widget editor edge cases and states |
| Charts | `e2e/charts.spec.ts` | Bar/line/table/JSON/value charts render correctly |
| Grid | `e2e/grid.spec.ts` | Drag, resize, save layout, view mode |
| Users | `e2e/users.spec.ts` | List, create, delete users |
| Parameters | `e2e/parameters.spec.ts` | Parameter widgets and cross-filtering |
| Sidebar States | `e2e/sidebar-states.spec.ts` | Sidebar uncovered states |
| Performance | `e2e/performance.spec.ts` | Tab switching, concurrent multi-connector queries, large dashboards |
| Responsive | `e2e/responsive.spec.ts` | Mobile viewport (375×812) layout |

### Patterns

**Page Objects**: Reusable selectors and actions per page.

```typescript
// e2e/pages/sidebar.ts
export class SidebarPage {
  constructor(private page: Page) {}

  async navigateTo(tab: 'Dashboards' | 'Connections' | 'Users') {
    await this.page.getByRole('button', { name: tab }).click();
  }
}
```

**Test Isolation**: Each test creates its own data and cleans up. Tests don't depend on each other.

**Selectors**: Prefer `getByRole`, `getByText`, `getByTestId` over CSS selectors.

### Playwright Config

Key settings in `app/playwright.config.ts`:
- **Global setup/teardown**: `e2e/global-setup.ts` / `e2e/global-teardown.ts` (testcontainers)
- **Web server**: `npx next dev --port 3000` (auto-started)
- **Timeouts**: 60s per test, 10s for expects, 15s navigation locally / 30s in CI
- **Retries**: 1 locally, 2 in CI
- **Traces**: on first retry (for debugging failures)

---

## Test Data

### Docker Seed Data (for E2E)

- **PostgreSQL**: App schema + 2 demo users (alice/bob, password: `password123`) + 2 connections + 2 dashboards + movies relational DB
- **Neo4j**: Movies graph (Person, Movie, City nodes with ACTED_IN, DIRECTED, etc.)
- Seed scripts: `docker/postgres/init.sql`, `docker/neo4j/init.cypher`

### Test Credentials

| User | Email | Password |
|------|-------|----------|
| Alice Demo | alice@example.com | password123 |
| Bob Demo | bob@example.com | password123 |

---

## CI Integration

### GitHub Actions Workflows

| Workflow | Trigger | What It Does |
|----------|---------|-------------|
| `app-tests.yml` | app/ changes | App Vitest unit tests + coverage |
| `component-tests.yml` | component/ changes | Component Vitest tests + coverage |
| `connection-tests.yml` | connection/ changes | Connection integration tests (with Docker services) |
| `e2e-tests.yml` | PR to main | Full Playwright E2E suite |
| `sonarqube.yml` | Push/PR | Coverage from all 3 packages + SonarCloud scan |

### SonarCloud

- All three packages generate coverage reports (`npm run test:coverage`)
- SonarCloud aggregates coverage, detects code smells, duplications, and security hotspots
- Quality gate must pass before merging

### CodeRabbit

- Automated PR reviews for code quality, security patterns, and conventions
- Always check and address CodeRabbit comments before merging

---

## Design Decisions

- **Unit tests in all three packages** — Each package has its own test boundary. `app/` tests API routes, hooks, and stores with mocked dependencies. `component/` tests pure UI in isolation. `connection/` tests DB adapters against real databases.
- **Testcontainers over docker-compose** — E2E tests are fully self-contained. No manual setup or persistent state between runs.
- **Coverage enforcement** — SonarCloud quality gate enforces minimum coverage thresholds across all packages.
