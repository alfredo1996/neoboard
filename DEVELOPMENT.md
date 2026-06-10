# Development Guide

This guide helps contributors get NeoBoard running locally and understand the development workflow. For PR etiquette and contribution policies, see [CONTRIBUTING.md](.github/CONTRIBUTING.md).

## Prerequisites

- **Node.js 20+** (check with `node -v`)
- **Docker Desktop** (for PostgreSQL and Neo4j dev containers)
- **npm** (not yarn or pnpm)

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/alfredo1996/neoboard.git
cd neoboard
npm install
```

### 2. Start dev databases

```bash
docker compose -f docker/docker-compose.yml up -d
```

This starts PostgreSQL 16 (port 5432) and Neo4j (port 7687) containers.

### 3. Configure environment

Generate `app/.env.local` with all required secrets in one step (the `neoboard` CLI is linked automatically by `npm install`):

```bash
neoboard env init
```

This writes `DATABASE_URL`, a generated `ENCRYPTION_KEY`, `NEXTAUTH_SECRET`, `API_KEY_HMAC_SECRET`, and an `ADMIN_BOOTSTRAP_TOKEN` for first signup.

Prefer manual control? Copy the template and generate each value yourself:

```bash
cp app/.env.example app/.env.local

# ENCRYPTION_KEY (AES-256-GCM — lost key = unrecoverable credentials)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# NEXTAUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# API_KEY_HMAC_SECRET (needed to create API keys from Settings)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the generated values into `app/.env.local`.

### 4. Run migrations and start

```bash
npm run db:migrate
npm run dev
```

The app is available at [http://localhost:3000](http://localhost:3000).

## Project Structure

NeoBoard is a monorepo with three packages. Each has strict boundaries:

| Package       | Purpose                                                | Rules                                      |
| ------------- | ------------------------------------------------------ | ------------------------------------------ |
| `app/`        | Next.js application (API routes, pages, stores, hooks) | Orchestrates the other two packages        |
| `component/`  | React UI library (`@neoboard/components`)              | No business logic, no API calls, no stores |
| `connection/` | Database connector library (Neo4j + PostgreSQL)        | No UI, no React                            |

**Never import across boundaries** -- `component/` and `connection/` must not import from `app/`, and `connection/` must not import from `component/`.

## Running Tests

```bash
# Unit tests per package
npm -w app run test
npm -w component run test
npm -w connection run test        # requires Docker

# End-to-end (requires Docker + running app)
npm run test:e2e
# Runs at 2 workers by default — higher parallelism causes login-timeout
# flakes from server/DB contention on a single machine (see #994).
# Experiment with: npx playwright test --workers=N

# Lint all packages
npm run lint

# Auto-fix lint errors in app/
cd app && npx next lint --fix
```

Coverage target is **80% per package**. Check with `npm run test:coverage` in each package.

## Development Workflow

1. **Branch from `dev`** using the naming convention:
   - `feat/issue-<N>-<slug>` for features
   - `fix/issue-<N>-<slug>` for bug fixes
   - `docs/`, `chore/`, `refactor/` for other work

2. **Use Conventional Commits**: `type(scope): description`

   ```
   feat(charts): add scatter plot widget
   fix(query): handle empty result sets gracefully
   docs: update DEVELOPMENT.md
   ```

3. **Lint and build before committing**:

   ```bash
   npm run lint
   npm run build
   ```

4. **Open a PR targeting `dev`**. Link the issue with `Closes #N` in the PR body. Add labels for type, package, and area.

## Adding a New Chart Type

NeoBoard uses a plugin-based chart registry. To add a chart type:

1. Create the chart component in `component/src/charts/`
2. Register it in `app/src/lib/plugin/chart-plugin-registry.ts`
3. Add a Storybook story in `component/src/stories/`

See existing chart implementations (bar, line, pie) for the pattern.

## Database Migrations

NeoBoard uses [Drizzle ORM](https://orm.drizzle.team/) with forward-only migrations.

```bash
# After modifying the schema in app/src/lib/db/schema/
npm run db:generate    # generates a migration file
npm run db:migrate     # applies pending migrations
npm run db:studio      # opens Drizzle Studio (DB GUI)
```

Migrations are **idempotent** and use an advisory lock to prevent concurrent runs. Never edit or delete an existing migration file.

## Useful Commands

| Command                                             | Description                            |
| --------------------------------------------------- | -------------------------------------- |
| `npm run dev`                                       | Start dev server (Turbopack)           |
| `npm run build`                                     | Production build + type-check          |
| `npm run lint`                                      | ESLint all packages                    |
| `npm run storybook`                                 | Component library viewer (port 6006)   |
| `npm run db:migrate`                                | Apply database migrations              |
| `npm run db:generate`                               | Generate migration from schema changes |
| `npm run db:studio`                                 | Open Drizzle Studio                    |
| `npm run test:e2e`                                  | Run Playwright E2E tests               |
| `docker compose -f docker/docker-compose.yml up -d` | Start dev databases                    |
| `docker compose -f docker/docker-compose.yml down`  | Stop dev databases                     |
