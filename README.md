# NeoBoard

A full-stack dashboard application for visualizing data from Neo4j and PostgreSQL databases. Built with a modular monorepo architecture featuring a reusable component library, a database connection module, and a Next.js application.

## Architecture

```
neoboard/
├── app/           # Next.js 15 App Router — full-stack application
├── component/     # @neoboard/components — React component library
├── connection/    # Database query execution module (Neo4j + PostgreSQL)
└── package.json   # Root orchestrator (--prefix scripts)
```

Each package is **fully independent** — no npm workspaces. Packages reference each other via `file:` dependencies and are orchestrated from the root with `--prefix` scripts.

## Tech Stack

### Application (`app/`)

| Category | Technology |
|----------|-----------|
| Framework | [Next.js 15](https://nextjs.org/) (App Router) |
| Language | TypeScript 5.9 |
| UI Components | `@neoboard/components` (local library) |
| Authentication | [Auth.js v5](https://authjs.dev/) (credentials + bcrypt + JWT) |
| Database ORM | [Drizzle ORM](https://orm.drizzle.team/) |
| Database Driver | [postgres.js](https://github.com/porsager/postgres) |
| State Management | [Zustand](https://github.com/pmndrs/zustand) |
| Data Fetching | [TanStack Query](https://tanstack.com/query) |
| Validation | [Zod](https://zod.dev/) |
| Encryption | AES-256-GCM (Node.js crypto) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |

### Component Library (`component/`)

| Category | Technology |
|----------|-----------|
| Base Components | [shadcn/ui](https://ui.shadcn.com/) (33 components) |
| Composed Components | 55 custom components (forms, layouts, pickers) |
| Charts | [ECharts 6](https://echarts.apache.org/) (Bar, Line, Pie, SingleValue, Graph) |
| Maps | [Leaflet](https://leafletjs.com/) + [React Leaflet](https://react-leaflet.js.org/) |
| Dashboard Layout | [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout) |
| Data Tables | [@tanstack/react-table](https://tanstack.com/table) |
| Storybook | [Storybook 10](https://storybook.js.org/) |
| Testing | [Vitest 4](https://vitest.dev/) + Testing Library (532 tests) |

### Connection Module (`connection/`)

| Category | Technology |
|----------|-----------|
| Neo4j | [neo4j-driver](https://github.com/neo4j/neo4j-javascript-driver) |
| PostgreSQL | [pg](https://node-postgres.com/) |
| Testing | Jest + Testcontainers |

## Features

- **Authentication** — Email/password with bcrypt hashing and JWT sessions
- **Dashboard Management** — Create, edit, view, and delete dashboards with JSONB layout persistence
- **Widget Editor** — Add chart widgets with chart type picker, connection selector, and query input
- **Connection Management** — Store and test Neo4j/PostgreSQL connections with AES-256-GCM encrypted credentials
- **Sharing** — Share dashboards with viewer/editor roles
- **Query Execution** — Server-side query execution against connected databases
- **Responsive Layout** — Collapsible sidebar with AppShell layout
- **Component Library** — 95 reusable components with Storybook documentation

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)

### 1. Start PostgreSQL

```bash
cd docker && docker compose up -d;
```

This starts a PostgreSQL 16 container on port 5432 with the database `neoboard`.

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install app dependencies
npm install --prefix app

# Install component library dependencies
npm install --prefix component
```

### 3. Configure Environment

```bash
cp app/.env.example app/.env.local
```

Edit `app/.env.local`:

```env
DATABASE_URL=postgresql://neoboard:neoboard@localhost:5432/neoboard
ENCRYPTION_KEY=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
NEXTAUTH_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
NEXTAUTH_URL=http://localhost:3000
```

### 4. Run Database Migrations

```bash
npm run db:migrate --prefix app
```

### 5. Start Development Server

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### One-Command Setup

For convenience, a setup script is provided:

```bash
./scripts/setup.sh
```

This script will:
1. Start PostgreSQL via Docker Compose
2. Install all dependencies
3. Generate environment variables
4. Run database migrations
5. Start the development server

## Available Scripts

### Root (orchestrator)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Build the Next.js app |
| `npm run storybook` | Start Storybook for the component library |
| `npm run test:components` | Run component library tests |
| `npm run lint` | Run ESLint |

### App (`app/`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:studio` | Open Drizzle Studio (DB GUI) |

### Component Library (`component/`)

| Script | Description |
|--------|-------------|
| `npm run storybook` | Start Storybook on port 6006 |
| `npm run test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run build` | Build the component library |

## Project Structure

### App (`app/src/`)

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Login + signup pages
│   ├── (dashboard)/        # Dashboard list, viewer, editor
│   ├── connections/        # Connection management page
│   └── api/                # REST API routes
│       ├── auth/           # Auth.js handler
│       ├── connections/    # CRUD + test endpoints
│       ├── dashboards/     # CRUD + sharing endpoints
│       └── query/          # Query execution endpoint
├── components/             # App-specific wrappers
│   ├── providers.tsx       # QueryClient + Session providers
│   ├── card-container.tsx  # Widget data fetching + chart rendering
│   └── dashboard-container.tsx  # Widget grid layout
├── hooks/                  # TanStack Query hooks
├── stores/                 # Zustand stores
└── lib/
    ├── db/                 # Drizzle schema + connection
    ├── auth/               # Auth.js config + signup action
    ├── crypto.ts           # AES-256-GCM encrypt/decrypt
    ├── chart-registry.ts   # Chart type → component mapping
    └── query-executor.ts   # Server-side query runner
```

### Component Library (`component/src/`)

```
src/
├── components/
│   ├── ui/         # 33 shadcn base components
│   └── composed/   # 55 composed components
├── charts/         # 7 chart components (ECharts + Leaflet)
├── hooks/          # Custom hooks (useContainerSize, useGraphExploration)
└── stories/        # 84 Storybook stories
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/connections` | Create connection |
| GET | `/api/connections` | List connections |
| DELETE | `/api/connections/[id]` | Delete connection |
| POST | `/api/connections/[id]/test` | Test connection |
| POST | `/api/dashboards` | Create dashboard |
| GET | `/api/dashboards` | List dashboards |
| GET | `/api/dashboards/[id]` | Get dashboard |
| PUT | `/api/dashboards/[id]` | Update dashboard |
| DELETE | `/api/dashboards/[id]` | Delete dashboard |
| POST | `/api/dashboards/[id]/share` | Share dashboard |
| GET | `/api/dashboards/[id]/share` | List shares |
| DELETE | `/api/dashboards/[id]/share` | Remove share |
| POST | `/api/query` | Execute query |

## Database Schema

The app uses PostgreSQL with Drizzle ORM. Key tables:

- **users** — Email/password accounts
- **connections** — Encrypted database connection configs
- **dashboards** — Dashboard metadata + JSONB layout
- **dashboardShares** — Per-user sharing with viewer/editor roles

Connection credentials are encrypted at rest using AES-256-GCM.

## Component Library Usage

All pages use components from `@neoboard/components`:

```tsx
import {
  Button, Input, Label, Card, Badge, Dialog,
  Select, Alert, Skeleton
} from "@neoboard/components";

import {
  PageHeader, EmptyState, LoadingButton, PasswordInput,
  ConnectionCard, ConnectionForm, ConfirmDialog,
  AppShell, Sidebar, SidebarItem, Toolbar,
  WidgetCard, ChartTypePicker, LoadingOverlay,
} from "@neoboard/components";

import {
  BarChart, LineChart, PieChart, SingleValueChart,
  GraphChart, MapChart
} from "@neoboard/components";
```
