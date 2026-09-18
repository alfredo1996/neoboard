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
npm run review:local                 # CodeRabbit review of committed changes vs the active release branch
npm run dev                          # Dev server (Turbopack, proxies to app/)
npm run build                        # Production build (webpack) + type-check
npm run lint                         # ESLint every package (root flat config)
npm run lint -- --fix                # Auto-fix lint errors in every package
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

## Working Rules

**Code quality:**

- TypeScript strict. No `any` without a comment explaining why.
- Prettier and `eslint --fix` run after every TypeScript edit (PostToolUse hook), which reports back anything ESLint could not fix. Fix those before moving on.
- Run `npm run lint` from the repo root to lint every package. This genuinely
  covers all of them as of #1547 — `component/`, `connection/` and
  `connector-sdk/` were globally ignored before that and had never been linted,
  which is how the #1546 stale-dependency bug shipped. Ignores that remain
  (`**/e2e`, `docs`, vendored `cypher-lang`) each carry their reason in
  `eslint.config.js`.
- Run `npm run build` before committing to catch type errors.
- Use `npm`, not `pnpm` or `yarn`.
- Topic rules live in `.claude/rules/` and load when you open a matching file: testing boundaries for tests, chart rules for charts.

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
- `can_write` permission: ALWAYS enforced server-side in the API route, not just UI, for a user's own write queries.
  Exception (#1831): a form widget submit is not gated by `can_write`. Anyone who can open the dashboard (owner, shares, admins, and on a public dashboard any user in the tenant) can submit it; the server runs only the form's saved query with the form's field parameters on its saved connection and database, never query text from the request.
  Adding or changing a form's query, connection or database requires access to that connection (`usableConnection`).

## Credentials — DO NOT VIOLATE

- NEVER log decrypted credentials.
- NEVER store encryption keys in the database.
- Encryption uses AES-256-GCM with the `ENCRYPTION_KEY` (a 64-character hex string = 32 bytes) as the key directly — no HKDF derivation, no envelope/data-key wrapping. Ciphertext format is `iv:authTag:ciphertext` (base64). Key rotation is supported via `ENCRYPTION_KEY_OLD` (decrypt-with-old, re-encrypt-with-new).
- Lost ENCRYPTION_KEY = all credentials unrecoverable. Always warn users about this.

## Connector Agnosticism — DO NOT VIOLATE

- NeoBoard is one dashboard where many systems collaborate; Neo4j and PostgreSQL are the first two connectors, not the product. `app/` and `component/` may know THAT connectors exist — NEVER which.
- The review test: **would this line change when connector N+1 is added?** If yes, it is a bug — a type comparison, a label, a URI scheme, a driver option key, a two-key map, product copy.
- Connector facts (type, label, protocols, fields, capabilities, query language) come from the connector itself: the registry in `connection/` (`getAllConnectors()`, `getConnector(type)`), read on the server and handed to the browser as data. `component/` receives them as props.
- Allowed: query-language names (`cypher`, `sql` — a language is not a connector), data-shape checks (is this value a node, a path, a row?), the app's own metadata database under `app/src/lib/db/`, and library package names (`@neo4j-nvl/*`, `@neo4j-cypher/*`).
- Enforced by two ratchets in `app/src/lib/__tests__/connector-agnostic.test.ts` (#1894): a name guard over `app/src` and `component/src`, and an export-surface guard over the `connection` and `connector-sdk` entry points. Both derive the forbidden names from the registry, so a new connector is covered from birth. Today's offenders sit in `connector-agnostic.baseline.json`, which may only shrink: NEVER add or raise an entry — fix the line; delete or lower the entry when you clean a file.

## Multi-Tenancy

- `tenant_id` column on ALL tables. Every DB query MUST include an explicit tenant filter — `eq(table.tenantId, session.tenantId)` — written **per query, in the route**. There is no ORM-level or middleware-level enforcement today (`app/src/lib/db/index.ts` is a plain Drizzle client), so a forgotten filter is a cross-tenant leak that the ORM will not catch. A test-time ratchet (`app/src/lib/db/__tests__/tenant-scope.test.ts`, #1226) fails the build on any unscoped query against a tenant table — it is a safety net, not runtime enforcement, so the per-query filter is still mandatory.
- Take `tenantId` from `requireSession()`, NEVER from the request body.
- JWT tokens include `tenantId` claim. Validate before ANY DB or API access.
- SaaS vs on-prem: env vars only, never code branches.

## Enterprise Features

Gated by the `NEOBOARD_EDITION` env var, not code branches. Must fall back gracefully in the community edition.

`app/src/lib/features/registry.ts` lists only features that exist, which today is **SSO alone**. Custom roles, user groups, connector labels and aliases, the environment selector, bulk import, dashboard sharing links, impersonation, session management and AST completion were ids in that list with no code behind them; they came out in #1845. Add an id back in the release its feature ships in.

**1.5 ships without the enterprise edition** (#1845): the switch and the `OIDC_*` variables are out of both example env files and both production compose files, and the docs no longer document SSO. The SSO code stays and is dormant — it runs only for an operator who sets the variable by hand, and it is unfinished (no sign-in button, Enforce SSO never enforced, a first sign-in that ignores claim role mapping). Enterprise resumes in v1.8.

## Migrations

Forward-only. Write them to be idempotent — nothing checks that mechanically. #1872 deleted the migration-lint script that claimed to: no workflow, hook or test ever ran it, and it exited 1 on drizzle-kit's own output. An advisory lock prevents concurrent runs.
Test version-skip paths. Boot migrations are controlled by `MIGRATE_ON_START` (`1`/`true` to run; set `0` to skip for emergency debugging) — there is no `--skip-migrations` CLI flag.

## Automated Guardrails (Hooks)

PreToolUse hooks block cross-package imports, an edit that adds a connector name under `app/src` or `component/src`, query interpolation, credential logging, barrel ECharts imports, chart components without `ssr: false`, edits on `main`, unapproved dependency installs, and `git commit` while UI files are waiting on Playwright. PostToolUse hooks run Prettier and `eslint --fix` on every TypeScript edit and report what they cannot fix. What each hook actually does is pinned by `scripts/__tests__/claude-hooks.node-test.mjs`.

## Compact instructions

When compacting, keep: the issue and PR numbers in play, the branch and its base, every file changed, which test commands ran and their results, and any decision the user made.

## Dev Notes

Durable notes — plans, drills, decisions, reviews — live in the Obsidian vault at `~/Desktop/neoboard-vault`, filed under its branch (`roadmap/`, `security/`, `product/`, …) and linked from the branch hub. The vault is its own git repo: commit there with a conventional message. `claude_code_docs/` (gitignored) is agent scratch only — the browser agents dump mid-run findings there and nothing in it is expected to survive. `scripts/__tests__/dev-notes-convention.test.mjs` fails if any other `.claude/` definition points at it.
