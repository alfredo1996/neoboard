# NeoBoard - Testing Approach

Testing strategy: component-level unit tests (Vitest) + full-app E2E tests (Playwright).
No additional test runners in the `app/` project — Playwright E2E covers stores, API routes, and chart rendering end-to-end.

---

## Testing Stack

| Tool | Package | Purpose |
|------|---------|---------|
| **Vitest** | `component/` | Unit test runner for component library |
| **React Testing Library** | `component/` | Component testing utilities |
| **@testing-library/user-event** | `component/` | User interaction simulation |
| **Storybook + Playwright** | `component/` | Visual browser tests |
| **Playwright** | `app/` | E2E tests for the full application |

---

## Testing Layers

```
          /  E2E (Playwright)  \       Full app flows against real DBs
         /──────────────────────\
        / Component Unit (Vitest)\     Individual component behavior
       /──────────────────────────\
```

---

## 1. Component Library Tests (Vitest)

**Location**: `component/src/**/__tests__/`
**Count**: 826 tests across 145 files (all passing)
**Runner**: Vitest with jsdom environment

### What's Tested
- All 33 base UI components
- All 55 composed components
- All 7 chart components
- Props, events, state changes, edge cases

### Commands
```bash
cd component
npm run test           # Run all tests
npm run test -- --watch  # Watch mode
```

### Config
```
component/vite.config.ts → test.projects:
  - "unit": jsdom environment, src/**/*.test.{ts,tsx}
  - "storybook": Playwright browser provider
```

---

## 2. E2E Tests (Playwright)

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
|-------|------|--------------|
| Auth | `e2e/auth.spec.ts` | Sign up, log in, log out, redirect when unauthenticated |
| Navigation | `e2e/navigation.spec.ts` | Sidebar on all pages, tab switching, collapse/expand |
| Connections | `e2e/connections.spec.ts` | Create, auto-status check, manual test, delete |
| Dashboards | `e2e/dashboards.spec.ts` | Create, view, edit, delete dashboards |
| Widgets | `e2e/widgets.spec.ts` | Two-step creation flow, query + preview, add to grid |
| Charts | `e2e/charts.spec.ts` | Bar/line/table/JSON/value charts render correctly |
| Grid | `e2e/grid.spec.ts` | Drag, resize, save layout, view mode |
| Users | `e2e/users.spec.ts` | List, create, delete users |

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
- **Timeouts**: 60s per test, 10s for expects, 15s for navigation
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

```yaml
# .github/workflows/test.yml
jobs:
  component-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd component && npm ci && npm test

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd app && npm ci
      - run: npx playwright install chromium
      - run: npm run test:e2e
      # testcontainers handles DB setup automatically — no services block needed
```

## Design Decisions

- **No unit tests in `app/`** — Playwright E2E already tests the full stack (API routes → query executor → connection module → chart rendering). Adding vitest to `app/` would be a redundant test layer with extra maintenance.
- **Component library is the unit test boundary** — pure UI logic and chart components are tested in isolation with Vitest. App-level integration (stores, hooks, API wiring) is tested via E2E.
- **Testcontainers over docker-compose** — E2E tests are fully self-contained. No manual setup or persistent state between runs.
