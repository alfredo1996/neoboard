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

All commands run from `app/` unless noted.

```bash
npm run dev          # Dev server
npm run build        # Production build + type-check
cd app && npm test   # Vitest unit tests (fast, no containers)
npm run test:e2e     # Playwright E2E (requires Docker)
npm run lint         # ESLint — run from repo root
cd app && npx next lint --fix  # Auto-fix lint errors in app/
npm run storybook    # Component library viewer
npm run db:migrate   # Drizzle migrations
npm run db:generate  # Generate migration from schema
docker compose up    # Start Neo4j + PostgreSQL dev containers
```

## Working Rules

- Run `cd app && npx next lint --fix` after every change.
- Run `npm run build` before committing to catch type errors.
- New behavior = new tests. No exceptions.
- Always check if you need to write tests for the code you're working on.
- Use Conventional Commits: `type(scope): description`.
- Branch naming: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `security/`.
- PRs need labels: type + package + area. See `/github` skill.
- TypeScript strict. No `any` without a comment explaining why.
- Use `npm`, not `pnpm` or `yarn`.
- Always run the tests of the related code you're writing before pushing to GitHub.

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

Read `claude_code_docs/` before working on specific areas. These contain implementation details, patterns, and examples that don't belong in this file.

## Migrations

Forward-only. Idempotent. Advisory lock prevents concurrent runs.
Test version-skip paths. `--skip-migrations` flag exists for emergency debugging.

## Git strategy

Two long-lived branches: `main` (stable) and `dev` (integration). Branch from `main` for new work; PRs target `dev` for integration testing before merging to `main`.

Branch naming: `feat/issue-<N>-<slug>`, `fix/issue-<N>-<slug>`, `chore/`, etc.

Keep branches separated; do not push if tests are failing.

For a release: create `release/vX.Y.Z` from `dev`, verify, then merge to `main`.

After finishing a branch: create a PR targeting `dev`, add the right milestone and labels, and link it to its issue using GitHub's "Closes #N" keyword — not just the issue number in the title.

## Design Review

Before touching any UI code, read the design skill files:

- `.claude/skills/design-review/skill.md` — Design taste document with actual tokens, spacing, typography, color, and chart patterns extracted from this codebase. Treat as source of truth for visual consistency.
- `.claude/skills/screenshot-review/skill.md` — Screenshot workflow for capturing before/after states and maintaining the baseline suite.

### Rules for UI Changes

- Always read `design-review/skill.md` before modifying any page, component, or layout.
- Screenshot before AND after any visual change. Store in `.screenshots/before/` and `.screenshots/after/`.
- Keep the baseline screenshot suite (`.screenshots/baseline-*/`) up to date when adding new pages or flows.
- Reference baseline screenshots for comparison during code review.
- New pages/flows must be added to the user story inventory and screenshot suite.
