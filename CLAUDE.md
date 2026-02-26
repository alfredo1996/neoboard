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

## Working Rules

**Code quality:**
- TypeScript strict. No `any` without a comment explaining why.
- Run `cd app && npx next lint --fix` after every change to `app/`.
- Run `npm run lint` from the repo root to lint all packages.
- Run `npm run build` before committing to catch type errors.
- Use `npm`, not `pnpm` or `yarn`.

**Git & PRs:**
- Conventional Commits: `type(scope): description`.
- Branch from `main`: `feat/issue-<N>-<slug>`, `fix/issue-<N>-<slug>`, `chore/`, etc.
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

## Detailed Docs

Read before working on specific areas:

- `claude_code_docs/TESTING_APPROACH.md` — Testing strategy, test commands, CI workflows
- `claude_code_docs/sonarqube-and-coverage.md` — SonarCloud integration and coverage setup

## Migrations

Forward-only. Idempotent. Advisory lock prevents concurrent runs.
Test version-skip paths. `--skip-migrations` flag exists for emergency debugging.

## Design Review

Before touching any UI code:
1. Read `.claude/skills/design-review/skill.md` — tokens, spacing, typography, color, chart patterns. Source of truth for visual consistency.
2. Read `.claude/skills/screenshot-review/skill.md` — screenshot workflow.

Rules:
- Screenshot before AND after any visual change (`screenshots/before/`, `.screenshots/after/`).
- Keep the baseline suite (`.screenshots/baseline-*/`) up to date for new pages/flows.
