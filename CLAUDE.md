# NeoBoard

Open-source dashboarding tool for hybrid database architectures (Neo4j + PostgreSQL).

## Tech Stack

Next.js 16 (App Router), React 19, TypeScript, shadcn/ui, Tailwind CSS, ECharts, Neo4j NVL, Leaflet, Zustand, TanStack Query, Auth.js v5, Drizzle ORM, Vitest, Playwright, Testcontainers. Monorepo managed via npm workspaces.

## Architecture — Three Packages (STRICT boundaries)

- `app/` — Next.js application. API routes, stores, hooks, pages. Orchestrates the other two.
- `component/` — React UI library. **NO business logic. NO API calls. NO stores. NO imports from app/.**
- `connection/` — DB connector library. **NO UI. NO React. NO imports from app/ or component/.**

Before editing any file, check which package it belongs to and respect its boundary.

## Commands

All commands run from the repo root unless noted.

```bash
npm run verify                       # Local CI mirror: typecheck + lint + all unit suites
npm run sonar:local                  # Scan the current branch against SonarCloud (real gate)
npm run review:local                 # CodeRabbit review of committed changes vs release/1.4
npm run dev                          # Dev server (Turbopack, proxies to app/)
npm run build                        # Production build (webpack) + type-check
npm run lint                         # ESLint all packages (root config)
npm -w app exec next lint -- --fix   # Auto-fix lint errors in app/
npm -w app run test                  # App Vitest unit tests (API routes, hooks, stores)
npm -w component run test            # Component Vitest unit tests
npm -w connection run test           # Connection integration tests (needs Docker)
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

## Testing Boundaries (app/ package)

| Layer                | Tool                    | Examples                                                                         |
| -------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| Pure functions/utils | Vitest (no DOM)         | chart-plugin-registry, normalize-value, date-utils, query-hash, wrap-with-preview-limit |
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
- **Exception**: when a `release/X.Y` branch is active, branch from and target it instead of `dev`.
- PRs target `dev` (integration) before merging to `main`.
- Do not push if tests are failing.
- PRs need labels: type + package + area. See `/github-workflow` skill.
- After finishing: PR targeting `dev`, correct milestone/labels, link issue via `Closes #N`.

**PR reviews:**

- Read `gh pr view <number> --comments` when resuming work on an existing PR.
- Address all CodeRabbit suggestions or dismiss with justification.
- SonarCloud quality gate must pass (coverage, duplications, code smells).

## Query Safety — DO NOT VIOLATE

- NEVER modify or wrap user queries. Safety is enforced at the driver/transaction level.
- ALWAYS use parameterized queries. NEVER interpolate user input into query strings.
- PostgreSQL read-only: `BEGIN READ ONLY` transactions for non-Form widgets.
- Neo4j read-only: session access modes.
- Row limits: cursor/stream consumption with MAX_ROWS+1 pattern. Never add LIMIT to user queries.
- Timeouts: enforced at the driver/transaction level — PostgreSQL via `SET LOCAL statement_timeout` inside the transaction; Neo4j via the managed-transaction `timeout`. Default 30s.
- Concurrency: a bespoke per-connector priority **scheduler** (`app/src/lib/query/scheduler.ts`, one per connectionId via `scheduler-registry.ts`) — **not** the `p-queue` npm package. Priority tiers (1=interactive > 2=load > 3=refresh, with P3 shed under load), per-user round-robin fairness, `maxConcurrent`/`maxPerUser` caps, backpressure (queue-full → 503) and queue timeouts; tuned via `QUERY_*` env vars. The drivers' own connection pools (node-pg `Pool`, Neo4j driver pool) sit underneath.
- `can_write` permission: ALWAYS enforced server-side in the API route, not just UI.

## Credentials — DO NOT VIOLATE

- NEVER log decrypted credentials.
- NEVER store encryption keys in the database.
- Encryption uses AES-256-GCM with the `ENCRYPTION_KEY` (a 64-character hex string = 32 bytes) as the key directly — no HKDF derivation, no envelope/data-key wrapping. Ciphertext format is `iv:authTag:ciphertext` (base64). Key rotation is supported via `ENCRYPTION_KEY_OLD` (decrypt-with-old, re-encrypt-with-new).
- Lost ENCRYPTION_KEY = all credentials unrecoverable. Always warn users about this.

## Multi-Tenancy

- `tenant_id` column on ALL tables. Every DB query MUST include an explicit tenant filter — `eq(table.tenantId, session.tenantId)` — written **per query, in the route**. There is no ORM-level or middleware-level enforcement today (`app/src/lib/db/index.ts` is a plain Drizzle client), so a forgotten filter is a cross-tenant leak that nothing catches. Adding a guard is tracked in #1226.
- Take `tenantId` from `requireSession()`, NEVER from the request body.
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
Test version-skip paths. Boot migrations are controlled by `MIGRATE_ON_START` (`1`/`true` to run; set `0` to skip for emergency debugging) — there is no `--skip-migrations` CLI flag.

## Automated Guardrails (Hooks)

The `.claude/settings.json` hooks enforce critical rules automatically:

**PreToolUse (Edit/Write):**
- Package boundary enforcement — blocks cross-package imports
- Query interpolation guard — blocks `${...}` near SQL/Cypher keywords
- Credential logging guard — blocks `console.log` of sensitive variables
- Migration file guard — blocks edits to existing migration files (forward-only)
- ECharts import guard — blocks `import * from 'echarts'`
- SSR guard — blocks chart components without `ssr: false`
- Main branch guard — blocks edits on `main`

**PreToolUse (Bash):**
- Dependency install guard — blocks `npm install/uninstall` without approval
- E2E enforcement — blocks `git commit` if UI files edited but Playwright not run

**PostToolUse:**
- Auto-format + lint on every TypeScript file edit
- E2E marker tracking (marks UI files as needing E2E, clears after playwright runs)
- Coverage threshold warning after test runs

**Session/Lifecycle:**
- SessionStart: branch status, PR info, Docker health check
- Stop: completion checklist (tests run? lint run? screenshots taken?)
- PreCompact: re-injects critical rules after context compaction

## Design Review

Before touching any UI code, read `.claude/skills/design-review/skill.md` — tokens, spacing, typography, color, chart patterns.

## Agent Pipeline (develop → review → assess)

Agents work together in a pipeline. Each stage gates the next:

1. **`project-architect`** — Plans features (impact analysis, risk, task breakdown)
2. **`/code` skill** — Implements the plan
3. **`test-runner`** + **`lint-fix`** — Verify code compiles, lints, tests pass
4. **`code-reviewer`** — Reviews code for security, architecture, quality. Runs unit + E2E tests.
5. **`feature-reviewer`** — Opens the browser (Playwright CLI), tests the feature UX + functionality
6. **`design-reviewer`** — Judges whether the change *looks* right: captures Storybook in light **and** dark, compares against the taste doc, reports token-level causes
7. **`ux-crawler`** — Full app regression: simulates admin/creator/reader across all user stories

### Quick reference

| Agent | Purpose | Model | Trigger |
|-------|---------|-------|---------|
| `project-architect` | Feature planning | opus | Complex features |
| `test-runner` | Run affected tests | haiku | After code changes |
| `lint-fix` | Lint + auto-fix | haiku | After code changes |
| `code-reviewer` | Code review + tests | sonnet | Pre-push, PR review |
| `feature-reviewer` | Browser-based feature testing (does it **work**) | sonnet | After implementing UI |
| `design-reviewer` | Does it **look right** — both themes, token-level | sonnet | After token/chart/appearance changes |
| `ux-crawler` | Full app UX audit | sonnet | Before releases, major changes |

The browser agents (`feature-reviewer`, `ux-crawler`, `user-sim-admin`, `user-sim-creator`) drive the running app via `npx @playwright/cli` — ensure Docker is up before invoking them. Their CLI usage, token-discipline rules, and NeoBoard browser gotchas live in each agent's own definition, not here.
