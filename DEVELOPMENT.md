# NeoBoard — Development Setup

This guide covers everything needed to run NeoBoard locally from scratch.

---

## Prerequisites

- **Node.js 20+** — [nvm](https://github.com/nvm-sh/nvm) recommended
- **Docker Desktop** (or compatible Docker daemon) — required for databases and E2E tests

---

## 1. Start Databases (Docker)

```bash
cd docker && docker compose up -d
```

This starts two containers:

| Container | Service | Port | Credentials |
|-----------|---------|------|-------------|
| `neoboard-postgres` | PostgreSQL 16 | 5432 | user: `neoboard`, password: `neoboard`, db: `neoboard` |
| `neoboard-neo4j` | Neo4j 5 Community | 7474 (HTTP), 7687 (Bolt) | user: `neo4j`, password: `neoboard123` |

Both containers include seed data:
- **PostgreSQL** (`docker/postgres/init.sql`): app schema + `movies` database with a full movie/cast dataset
- **Neo4j** (`docker/neo4j/init.cypher`): movie graph with Person, Movie, City nodes

Wait for healthy status before continuing:
```bash
docker compose ps   # both should show "healthy"
```

---

## 2. Install Dependencies

```bash
# Root (orchestrator scripts)
npm install

# Next.js application
npm install --prefix app

# Component library
npm install --prefix component

# Connection module
npm install --prefix connection
```

---

## 3. Configure Environment

```bash
cp app/.env.example app/.env.local
```

Edit `app/.env.local` and fill in the generated secrets:

```env
DATABASE_URL=postgresql://neoboard:neoboard@localhost:5432/neoboard

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=<your-32-byte-hex-key>
NEXTAUTH_SECRET=<your-32-byte-hex-key>
NEXTAUTH_URL=http://localhost:3000

# One-time token for bootstrapping the first admin account via the /signup UI.
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# After the first admin is created, this token is no longer needed.
ADMIN_BOOTSTRAP_TOKEN=<your-32-byte-hex-key>

# Alternative: auto-create the first admin at server startup (instrumentation.ts).
# Both vars must be set; BOOTSTRAP_ADMIN_PASSWORD must be at least 6 characters.
# Remove these after the first admin is created — do not keep them in version control.
# BOOTSTRAP_ADMIN_EMAIL=admin@example.com
# BOOTSTRAP_ADMIN_PASSWORD=<your-secure-password>
```

---

## 4. Run Database Migrations

```bash
npm run db:migrate --prefix app
```

This applies Drizzle ORM migrations to the `neoboard` PostgreSQL database (users, connections, dashboards tables).

---

## 5. Start the Dev Server

```bash
npm run dev
```

The app is available at [http://localhost:3000](http://localhost:3000).

---

## First Admin Bootstrap

On a fresh deployment (empty database), the `/signup` page enters **bootstrap mode**:

1. `setup.sh` generates an `ADMIN_BOOTSTRAP_TOKEN` and writes it to `app/.env.local`.
2. The token is printed prominently in the setup output.
3. Visit `http://localhost:3000/signup` — you will see a "First Admin Setup" banner.
4. Fill in your name, email, password, and paste the bootstrap token.
5. Your account is created with the `admin` role.
6. All subsequent `/signup` calls create `creator` accounts; the token is no longer required.

If you ever need to find the token again, read it from `app/.env.local`:
```bash
grep ADMIN_BOOTSTRAP_TOKEN app/.env.local
```

---

## One-Command Setup

The `scripts/setup.sh` script automates steps 1–5:

```bash
./scripts/setup.sh
```

---

## Running Tests

### Component Library (Vitest)

```bash
npm run test:components
# or directly:
cd component && npm test
```

826 unit tests covering all UI components and chart components.

### Connection Module (Jest + Testcontainers)

```bash
cd connection && npm test
```

Tests spin up fresh PostgreSQL and Neo4j containers automatically via `testcontainers`. No manual Docker setup needed — containers start, run tests, then stop. 121 tests total.

### E2E Tests (Playwright)

```bash
cd app && npm run test:e2e
```

Also uses `testcontainers` — fully self-contained, no manual `docker compose` needed for the test run. The app dev server is auto-started by Playwright.

---

## Architecture Overview

```
neoboard/
├── app/           # Next.js 15 App Router (port 3000)
├── component/     # @neoboard/components — React component library (Storybook: port 6006)
├── connection/    # Database query module (Neo4j + PostgreSQL)
└── docker/        # Docker Compose + seed data
```

Each package is independent (no npm workspaces). They reference each other via `file:` dependencies.

### Database Structure

| Database | Purpose | Managed By |
|----------|---------|------------|
| `neoboard` (PostgreSQL) | App data: users, connections, dashboards | Drizzle ORM migrations |
| `movies` (PostgreSQL) | Demo data: movies, people, roles | `docker/postgres/init.sql` |
| Neo4j | Demo data: movie graph | `docker/neo4j/init.cypher` |

### Environment Notes

- Connection credentials stored in the app database are **AES-256-GCM encrypted** using `ENCRYPTION_KEY`
- Auth sessions use JWT signed with `NEXTAUTH_SECRET`
- The connection module (`connection/`) connects directly to user-specified databases — not the app database

---

## Useful Commands

| Command | What It Does |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run storybook` | Start Storybook (component library docs) |
| `npm run db:studio --prefix app` | Open Drizzle Studio (DB GUI at localhost:4983) |
| `npm run db:generate --prefix app` | Generate new migrations after schema changes |
| `npm run lint` | Run ESLint across the project |
| `docker compose logs -f` | Follow container logs |
| `docker compose down -v` | Stop containers and remove volumes (full reset) |
