# NeoBoard

Open-source dashboarding tool for hybrid database architectures (Neo4j + PostgreSQL).

## Tech Stack

Next.js 15 (App Router), React 19, TypeScript, shadcn/ui, Tailwind CSS, ECharts, Neo4j NVL, Leaflet, Zustand, TanStack Query, Auth.js v5, Drizzle ORM, Vitest, Playwright, Testcontainers.

## Architecture — Three Packages (STRICT boundaries)

- `app/` — Next.js application. API routes, stores, hooks, pages. Orchestrates the other two.
- `component/` — React UI library. **NO business logic. NO API calls. NO stores. NO imports from app/.**
- `connection/` — DB connector library. **NO UI. NO React. NO imports from app/ or component/.**

Before editing any file, check which package it belongs to and respect its boundary.

## Commands

All commands run from the repo root unless noted.

```bash
npm run dev                          # Dev server (proxies to app/)
npm run build                        # Production build + type-check
npm run lint                         # ESLint all packages (root config)
cd app && npx next lint --fix        # Auto-fix lint errors in app/
cd app && npm test                   # App Vitest unit tests (API routes, hooks, stores)
cd component && npm test             # Component Vitest unit tests
cd connection && npm test            # Connection integration tests (needs Docker)
npm run test:e2e                     # Playwright E2E (requires Docker)
npm run storybook                    # Component library viewer
npm run db:migrate                   # Drizzle migrations
npm run db:generate                  # Generate migration from schema
docker compose up                    # Start Neo4j + PostgreSQL dev containers
```

## TDD Workflow (mandatory)

Follow Red → Green → Refactor on every change:

1. **Red** — Write a failing test that describes the expected behavior. Do not write implementation yet.
2. **Green** — Write the minimum code to make the test pass. No gold-plating.
3. **Refactor** — Clean up without breaking tests.

Rules:

- Write the test **before** the implementation. No exceptions.
- Run the relevant test suite before and after every change to confirm Red → Green.
- Every new behavior, bug fix, and edge case gets a test.
- Tests live in `__tests__/` next to the file under test, same package.
- See `claude_code_docs/TESTING_APPROACH.md` for suite structure, commands, and patterns.

## Testing Boundaries (app/ package)

| Layer                | Tool                    | Examples                                                                         |
| -------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| Pure functions/utils | Vitest (no DOM)         | chart-registry, normalize-value, date-utils, query-hash, wrap-with-preview-limit |
| API routes           | Vitest (mocked DB/auth) | Validation, permissions, error handling                                          |
| Zustand stores       | Vitest (no mocks)       | State transitions, cascading logic                                               |
| Store orchestration  | Vitest (no DOM)         | parameter-widget-renderer interactions, type coercion                            |
| Auth helpers         | Vitest (mocked auth)    | Session extraction, signup validation                                            |
| UI components (app/) | Vitest (jsdom)          | Render tests, branch coverage, error states — `.test.tsx` files                  |
| Full user flows      | Playwright E2E          | Real rendering, real data, real interactions                                     |

**Coverage target: 80% per package** (unit + E2E combined). Track with `npm run test:coverage` in each package.

**Vitest in `app/` uses two project environments:**

- **`unit`** (node): `.test.ts` files — pure logic, API routes, stores, hooks. No DOM.
- **`component`** (jsdom): `.test.tsx` files — render tests with `@testing-library/react`. Mock `@neoboard/components` and Next.js modules (`next/navigation`, `next/dynamic`). Use for branch coverage of UI components that E2E can't reach (error states, edge cases, loading states).

Playwright E2E with **server-side coverage collection** (`collectServer: true` in nextcov config) complements jsdom tests for full user flows. UI component tests in `component/` package remain isolated (no business logic).

**Vendored code** (e.g., `component/src/lib/cypher-lang/`) is excluded from SonarCloud coverage requirements but should have basic smoke tests to catch regressions from local modifications.

## Working Rules

**Code quality:**

- TypeScript strict. No `any` without a comment explaining why.
- Run `cd app && npx next lint --fix` after every change to `app/`.
- Run `npm run lint` from the repo root to lint all packages.
- Run `npm run build` before committing to catch type errors.
- Use `npm`, not `pnpm` or `yarn`.

**Requirements drill (mandatory before new work):**

- Before creating a branch or starting implementation on any issue, run `/drill <issue-number>`.
- The drill gathers scope, UX flow, edge cases, security concerns, and acceptance criteria.
- Do NOT skip the drill. Do NOT start coding, branching, or planning without it.
- The drill output becomes the source of truth for what to build and how to verify it.
- For trivial fixes (typos, one-line changes), a minimal drill (1 round) is sufficient.

**Git & PRs:**

- Conventional Commits: `type(scope): description`.
- Branch from `dev`: `feat/issue-<N>-<slug>`, `fix/issue-<N>-<slug>`, `chore/`, etc.
- PRs target `dev` (integration) before merging to `main`.
- Do not push if tests are failing.
- PRs need labels: type + package + area. See `/github` skill.
- After finishing: PR targeting `dev`, correct milestone/labels, link issue via `Closes #N`.

**PR reviews:**

- Read `gh pr view <number> --comments` when resuming work on an existing PR.
- Address all CodeRabbit suggestions or dismiss with justification.
- SonarQube quality gate must pass (coverage, duplications, code smells).

## Query Safety — DO NOT VIOLATE

- NEVER modify or wrap user queries. Safety is enforced at the driver/transaction level.
- ALWAYS use parameterized queries. NEVER interpolate user input into query strings.
- PostgreSQL read-only: `BEGIN READ ONLY` transactions for non-Form widgets.
- Neo4j read-only: session access modes.
- Row limits: cursor/stream consumption with MAX_ROWS+1 pattern. Never add LIMIT to user queries.
- Timeouts: enforced at driver level (AbortSignal for pg, native for Neo4j). Default 30s.
- Concurrency: per-connector `p-queue`. One queue per connector.
- `can_write` permission: ALWAYS enforced server-side in the API route, not just UI.

## Credentials — DO NOT VIOLATE

- NEVER log decrypted credentials.
- NEVER store encryption keys in the database.
- Encryption uses AES-256-GCM envelope scheme (HKDF-SHA256 key derivation).
- Lost ENCRYPTION_KEY = all credentials unrecoverable. Always warn users about this.

## Multi-Tenancy

- `tenant_id` column on ALL tables. Every DB query MUST include tenant filter at ORM/middleware level.
- JWT tokens include `tenantId` claim. Validate before ANY DB or API access.
- SaaS vs on-prem: env vars only, never code branches.

## Charts & Widgets

- Chart components MUST use `next/dynamic` with `ssr: false`. No exceptions.
- ECharts: import from `echarts/core` + specific modules. NEVER `import * as echarts from 'echarts'`.
- Heavy deps (NVL, Leaflet) loaded only when a widget of that type is on the current dashboard.
- Check existing components in `component/src/` and Storybook before creating new ones.

## Enterprise Features

Gated by env vars, not code branches. Must fall back gracefully when not licensed.
Includes: SSO, Custom Roles, Connector Labels, Bulk Import, Connector CRUD API, Dashboard Sharing Links, Query Result Caching, Environment Selector, Connector Alias.

## Migrations

Forward-only. Idempotent. Advisory lock prevents concurrent runs.
Test version-skip paths. `--skip-migrations` flag exists for emergency debugging.

## Design Review

Before touching any UI code, read `.claude/skills/design-review/skill.md` — tokens, spacing, typography, color, chart patterns.

## Agent Pipeline (develop → review → assess)

Agents work together in a pipeline. Each stage gates the next:

1. **`project-architect`** — Plans features (impact analysis, risk, task breakdown)
2. **`/code` skill** — Implements the plan
3. **`test-runner`** + **`lint-fix`** — Verify code compiles, lints, tests pass
4. **`code-reviewer`** — Reviews code for security, architecture, quality. Runs tests.
5. **`feature-reviewer`** — Opens the browser (Playwright CLI), tests the feature UX + functionality
6. **`ux-crawler`** — Full app regression: simulates admin/creator/reader across all user stories

### Quick reference

| Agent | Purpose | Model | Trigger |
|-------|---------|-------|---------|
| `project-architect` | Feature planning | opus | Complex features |
| `test-runner` | Run affected tests | haiku | After code changes |
| `lint-fix` | Lint + auto-fix | haiku | After code changes |
| `code-reviewer` | Code review + tests | sonnet | Pre-push, PR review |
| `feature-reviewer` | Browser-based feature testing | sonnet | After implementing UI |
| `ux-crawler` | Full app UX audit | sonnet | Before releases, major changes |

### Playwright CLI (for browser agents)

`feature-reviewer` and `ux-crawler` use `npx @playwright/cli` to interact with the running app at `http://localhost:3000`. Ensure Docker is running before invoking them.
