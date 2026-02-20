# NeoBoard

**The open-source dashboarding tool for hybrid database architectures.**

NeoBoard bridges the gap between graph and relational databases, enabling teams to build dashboards that query Neo4j, PostgreSQL, and more — all in one place.

Born from experience building NeoDash Commercial at Neo4j Professional Services, NeoBoard addresses the lack of graph visualization tools that integrate with other databases for truly hybrid architectures (e.g., topology in Neo4j for fraud detection alongside user data in PostgreSQL).

---

## Deployment

| Model | Description |
|-------|-------------|
| **On-Premise** | Self-hosted for organizations requiring data sovereignty |
| **SaaS** | Hosted multi-tenant deployment (future phase) |

---

## SaaS Architecture & Scalability

NeoBoard's SaaS deployment must handle multi-tenancy, concurrent query execution against customer databases, and bursty dashboard traffic — all while keeping the on-premise deployment simple (single container). The architecture is designed to scale horizontally at each layer.

### High-Level Topology

```
┌─────────────────────┐
│   Load Balancer      │
│   (e.g., AWS ALB)    │
└──────────┬──────────┘
           │
  ┌────────┼────────┐
  ▼        ▼        ▼
┌─────┐ ┌─────┐ ┌─────┐
│Next │ │Next │ │Next │
│.js  │ │.js  │ │.js  │
└──┬──┘ └──┬──┘ └──┬──┘
   │       │       │
┌──┴───────┴───────┴──┐
│                      │
│  ┌────────┐ ┌──────┐│
│  │Postgres│ │Redis ││
│  │(app DB)│ │      ││
│  └────────┘ └──────┘│
│  ┌──────────────────┐│
│  │ Query Worker Pool ││
│  └──────────────────┘│
│                      │
│  Customer databases  │
│  ┌──────┐ ┌────────┐│
│  │Neo4j │ │Postgres││
│  └──────┘ └────────┘│
└──────────────────────┘
```

### 1. Multi-Tenancy

| Concern | Strategy |
|---------|----------|
| **Data isolation** | Row-level security via `tenant_id` column on all tables. Every query includes a tenant filter enforced at the ORM/middleware layer — not optional per-route. |
| **Schema isolation (alternative)** | For high-compliance tenants (Enterprise), support schema-per-tenant or database-per-tenant in PostgreSQL. This is a deployment-time config, not a code fork. |
| **Auth isolation** | JWT tokens include `tenantId` claim. Middleware validates tenant context before any DB or API access. |
| **Connector isolation** | Connections belong to a tenant. The query execution layer enforces that a user can only run queries against their tenant's connectors. |

### 2. Query Execution — The Hard Problem

NeoBoard proxies user-written queries to external databases. This is the primary scaling bottleneck because:

- Queries can be arbitrarily slow (unoptimized Cypher, full table scans)
- Customer databases have varying latency/throughput
- Auto-refresh multiplies load linearly

| Concern | Strategy |
|---------|----------|
| **Timeouts** | Every query has a hard timeout (configurable per-tenant, default 30s). The connection module enforces this at the driver level. Runaway queries are killed server-side, not just abandoned. |
| **Connection pooling** | The current in-memory `Map` cache is replaced with a shared connection pool. For PostgreSQL, this means `pgBouncer` or a pool-aware driver config. For Neo4j, the driver already pools internally — but the module cache must be shared (Redis-backed connection metadata + per-instance driver instances). |
| **Rate limiting** | Per-tenant query rate limits (e.g., 100 queries/min for free tier, 1000 for enterprise). Enforced via Redis counters at the API layer. Prevents a single tenant from starving others. |
| **Query result caching** | Identical query+params+connection combinations cache results in Redis with a configurable TTL (default 60s). Auto-refresh widgets hit cache instead of re-executing if within TTL. Cache key: `hash(tenantId, connectionId, query, params)`. |
| **Async query execution** | For long-running queries, the API returns a job ID immediately. The client polls or subscribes (WebSocket/SSE) for results. This prevents HTTP timeouts and frees up Next.js server threads. Backed by a Redis queue (BullMQ) with dedicated worker processes. |
| **Row limits** | All query results are capped (default 10,000 rows, configurable). Prevents memory exhaustion from `SELECT *` on large tables. |

### 3. Horizontal Scaling

| Layer | How it scales |
|-------|--------------|
| **Next.js instances** | Stateless (JWT auth, no server-side sessions). Add instances behind the load balancer. Session affinity not required. |
| **PostgreSQL (app DB)** | Read replicas for dashboard listing, user lookups. Writes go to primary. Connection pooling via PgBouncer. For large scale: partition by tenant. |
| **Redis** | Handles query result cache, rate limit counters, BullMQ job queues, and pub/sub for real-time updates. Redis Cluster for HA. |
| **Query workers** | Separate Node.js processes consuming from the BullMQ queue. Scale independently of web servers based on query load. |
| **Static assets** | Next.js static export for the dashboard viewer (CDN-cacheable). Only edit mode and API routes need the server. |

### 4. Auto-Refresh at Scale

Auto-refresh is the silent scaling killer. 1,000 dashboards with 10 widgets each refreshing every 30s = 20,000 queries/minute.

| Strategy | Description |
|----------|-------------|
| **Server-side coalescing** | If 50 users are viewing the same shared dashboard, execute each widget query once and broadcast the result — not 50 times. |
| **Staggered refresh** | Instead of all widgets refreshing at exactly `t + interval`, add jitter (`±10%`) to spread load. |
| **Cache-first refresh** | Auto-refresh checks the query cache before executing. If a cached result exists within the TTL, use it. |
| **Backpressure** | If the query worker queue depth exceeds a threshold, auto-refresh intervals are automatically lengthened. The UI shows a "delayed" indicator. |
| **Minimum interval** | Enforce a minimum refresh interval per tier (e.g., 30s free, 10s enterprise) to prevent abuse. |

### 5. On-Premise Simplicity

The same codebase must deploy as a single Docker container for on-premise users. The scaling infrastructure (Redis, workers, PgBouncer) is opt-in:

```yaml
# Minimal on-premise: single container, embedded everything
docker run -e DATABASE_URL=... -e ENCRYPTION_KEY=... neoboard:latest

# SaaS: orchestrated with external services
# Redis, PgBouncer, workers deployed separately via Kubernetes / docker-compose
```

| Mode | Redis | Workers | PgBouncer |
|------|:-----:|:-------:|:---------:|
| **On-Premise** | Optional (in-memory fallback) | Inline (queries run in Next.js process) | Not needed |
| **SaaS** | Required | Required (separate processes) | Recommended |

This is controlled via environment variables, not code branches. The query executor checks for Redis availability and falls back to in-memory caching and synchronous execution.

### 6. Observability

| Concern | Tool |
|---------|------|
| **Metrics** | Prometheus-compatible metrics: query latency (p50/p95/p99), query queue depth, cache hit rate, active connections per tenant, error rates |
| **Logging** | Structured JSON logs with `tenantId`, `userId`, `connectionId`, `queryDuration`. Shipped to any log aggregator. |
| **Alerting** | Alerts on: query timeout rate > 5%, queue depth > 1000, connection failure rate spike, tenant hitting rate limits |
| **Tracing** | OpenTelemetry spans from API request → query execution → customer DB response. Critical for debugging slow dashboards. |

### 7. Security at Scale

| Concern | Strategy |
|---------|----------|
| **Credential isolation** | AES-256-GCM encryption per-tenant with tenant-specific key derivation. Key management via AWS KMS / HashiCorp Vault in SaaS mode. |
| **Network isolation** | Customer database connections routed through a VPN gateway or SSH tunnel (Enterprise). Never exposed to the public internet. |
| **Query sandboxing** | Read-only connections by default. Write access (form widgets) requires explicit opt-in per-connector. SQL injection mitigated by parameterized queries — user input never interpolated into query strings. |
| **Audit log** | All query executions, connection changes, and permission changes logged with actor, timestamp, and tenant context. |

---

## Query Execution Safety

NeoBoard proxies user-written queries to customer databases it does not own or control. All safety enforcement happens at the application and driver level — NeoBoard never requires setup or configuration changes on the customer's database.

### Timeouts

Every query is subject to a hard timeout enforced at the driver level, not the HTTP layer.

**PostgreSQL** — The `pg` driver supports query cancellation via `AbortSignal`. When the signal fires, the driver sends a cancel request to PostgreSQL, which terminates the running statement server-side:

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

try {
    const result = await client.query({
        text: query,
        values: params,
        signal: controller.signal,
    });
    return result;
} finally {
    clearTimeout(timeout);
}
```

**Neo4j** — The driver has native transaction-level timeout. The timeout is sent to the server, which enforces it:

```typescript
session.executeRead(tx => tx.run(query, params), { timeout: config.timeoutMs })
```

Default timeout is 30 seconds, configurable via environment variable.

### Row Limits

Row limits are enforced at the stream/fetch level. User queries are never wrapped or modified — capping happens by controlling how many results are consumed from the driver.

**PostgreSQL** — Use a cursor to read only `MAX_ROWS + 1` rows. The `+1` pattern detects truncation without a separate count query:

```typescript
const cursor = client.query(new Cursor(query, params));
const rows = await cursor.read(MAX_ROWS + 1);
const truncated = rows.length > MAX_ROWS;
if (truncated) rows.pop();
await cursor.close();
```

**Neo4j** — Consume records from the driver's async iterator and stop after the limit:

```typescript
const records: Record[] = [];
let truncated = false;
const result = session.executeRead(tx => tx.run(query, params));
for await (const record of result) {
    if (records.length >= MAX_ROWS) {
        truncated = true;
        break; // driver stops pulling from server
    }
    records.push(record);
}
```

**Byte-size guard** — A secondary check tracks cumulative result size during streaming. 10,000 rows of wide data (BLOBs, large text) can still exhaust memory. If total size exceeds `maxResultSizeMb`, the query is aborted:

```typescript
let totalBytes = 0;
for (const row of incomingRows) {
    totalBytes += estimateRowSize(row);
    if (totalBytes > config.maxResultSizeMb * 1_048_576) {
        throw new QueryResultTooLargeError();
    }
    rows.push(row);
}
```

### Configuration

```typescript
interface QueryExecutionConfig {
    timeoutMs: number;       // default 30000
    maxRows: number;         // default 10000
    maxResultSizeMb: number; // default 50
}
```

All values are configurable via environment variables.

### Query Concurrency

All query executions pass through a per-connector concurrency limiter. This protects customer databases from bursts — environment switches, dashboard loads, auto-refresh — by capping how many queries run simultaneously against each connector.

**On-Premise** — Uses `p-queue`, a lightweight in-memory promise queue with built-in concurrency control, timeout, and priority support. No external dependencies. One queue per connector, so a slow Neo4j instance doesn't block queries to a fast PostgreSQL:

```typescript
import PQueue from 'p-queue';

const queues = new Map<string, PQueue>();

function getQueue(connectorId: string): PQueue {
  if (!queues.has(connectorId)) {
    queues.set(connectorId, new PQueue({
      concurrency: config.maxConcurrentQueries, // default 4
      timeout: config.timeoutMs,                // default 30000
      throwOnTimeout: true,
    }));
  }
  return queues.get(connectorId)!;
}

// Usage
const result = await getQueue(connectorId).add(() => executeQuery(query, params));
```

Queued queries are lost on process restart, which is acceptable — widgets re-query on page load regardless. Widgets waiting in queue show a loading state. No user-facing queuing UI — backpressure is handled silently.

**SaaS (future)** — The in-memory queue is replaced by BullMQ backed by Redis. BullMQ requires Redis, which is already present in the SaaS stack for caching and rate limiting. This enables the queue to survive process restarts and be shared across multiple worker instances. The `QueryQueue` interface stays the same — only the implementation changes.

### Read-Only Enforcement (PostgreSQL)

Two layers, both on NeoBoard's side. Neo4j read-only enforcement is already handled in the connection library via session access modes.

**Layer 1: Transaction-level read mode (safety net).** All non-Form widget queries run inside a read-only transaction. PostgreSQL enforces this server-side — any write attempt returns `cannot execute INSERT in a read-only transaction`. This works with whatever credentials the customer provided, even superuser:

```typescript
await client.query('BEGIN READ ONLY');
try {
  const result = await client.query(query, params);
  await client.query('COMMIT');
  return result;
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
}
```

Form widgets skip this and use a normal transaction (`BEGIN` without `READ ONLY`), gated by the `canWrite` permission check.

**Layer 2: Static query analysis (UX fast-check).** Before sending the query to the database, parse it and reject non-SELECT statements immediately in the editor:

```typescript
import { parse } from 'pgsql-ast-parser';

function assertReadOnly(sql: string): void {
  const statements = parse(sql);
  const writeOp = statements.find(s => s.type !== 'select');
  if (writeOp) {
    throw new Error(
      `Statement type "${writeOp.type}" is not allowed — this widget only supports SELECT queries.`
    );
  }
}
```

The static analysis is a UX convenience (immediate, friendly error). The read-only transaction is the backstop that catches anything the parser misses (e.g., a `SELECT` calling a function with side effects).

---

## Credential Encryption & Key Management

Connection credentials (passwords, tokens) are encrypted at rest using envelope encryption. This runs entirely within NeoBoard's app database — no setup required on the customer's database.

### Encryption Scheme

```
ENCRYPTION_KEY (env var)
  └─► derives KEK via HKDF-SHA256 with a per-credential salt
        └─► encrypts per-credential DEK (Data Encryption Key)
              └─► encrypts the actual password/token (AES-256-GCM)
```

Stored alongside each credential in the database:
- Encrypted DEK
- Encrypted credential
- GCM nonce
- HKDF salt

The KEK and ENCRYPTION_KEY are never stored.

### Key Rotation

Key rotation re-wraps DEKs without re-encrypting the underlying secrets. A CLI command handles the migration:

```bash
neoboard rotate-key --old-key=... --new-key=...
```

This decrypts all DEKs with the old KEK, derives a new KEK from the new `ENCRYPTION_KEY`, and re-encrypts all DEKs. Each row tracks which KEK version encrypted it, so the migration can resume if interrupted.

### Startup Behavior

On container startup, NeoBoard attempts to decrypt all stored credentials. If decryption fails for any connector, that connector is marked as unhealthy and logs a clear error:

```
ERROR: Credential decryption failed for connector "prod-neo4j" — check ENCRYPTION_KEY
```

The container continues to start. Healthy connectors remain functional. This prevents a lost key from bricking the entire instance.

### Documentation

Users must be clearly informed: if the `ENCRYPTION_KEY` is lost, all stored credentials are unrecoverable and must be re-entered.

---

## Deployment & Upgrades

### On-Premise Deployment

Single Docker container with minimal configuration:

```yaml
docker run \
  -e DATABASE_URL=postgres://... \
  -e ENCRYPTION_KEY=... \
  neoboard:latest
```

### Schema Migrations

NeoBoard's app database schema evolves between releases. Migrations run automatically on container startup before the server accepts requests, using Drizzle's migration system:

```typescript
async function startup() {
  await migrate(db, { migrationsFolder: './drizzle' });
  startNextServer();
}
```

**Concurrency safety** — An advisory lock prevents duplicate containers from running migrations simultaneously. Only one process acquires the lock; others wait.

**Version skipping** — Users may upgrade from v1.2 directly to v1.5. Drizzle runs all pending migrations sequentially. Each migration must be forward-only and idempotent. The version-skip path is tested in CI via a migration matrix that runs the full suite starting from every past release.

**Escape hatch** — A `--skip-migrations` flag allows starting the container without running migrations, for emergency debugging when a migration fails.

**Backup** — A CLI command dumps the app database before upgrades:

```bash
neoboard backup --output=/path/to/backup.sql
```

The documented upgrade process: backup → pull new image → start container (auto-migrates) → verify. If something breaks, restore the backup and revert to the previous image.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend + Backend** | Next.js 15 (App Router) |
| **Language** | TypeScript |
| **UI** | React 19, shadcn/ui, Tailwind CSS |
| **Charts** | ECharts, Neo4j NVL, Leaflet |
| **State** | Zustand, TanStack Query |
| **Auth** | Auth.js v5 (NextAuth) |
| **ORM** | Drizzle ORM |
| **App Database** | PostgreSQL (user management + app metadata) |
| **Testing** | Vitest, Jest, Playwright, Testcontainers |

### Performance

Chart libraries are the largest contributors to bundle size. To keep initial page load fast (target: under 200KB gzipped), chart types are loaded on demand.

**Dynamic imports per chart type** — Each chart component uses `next/dynamic` with `ssr: false`. A dashboard with only tables and bar charts never downloads the map renderer or graph visualization:

```typescript
const GraphChart = dynamic(() => import('./charts/GraphChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />
});
const MapChart = dynamic(() => import('./charts/MapChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />
});
```

**Modular ECharts imports** — Instead of importing all of ECharts, each chart component imports only the modules it needs:

```typescript
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);
```

**Heavy dependencies loaded lazily** — Neo4j NVL (graph visualization) and Leaflet (maps) are separate heavy bundles. They are loaded only when a widget of that type is present on the current dashboard.

Bundle size is measured in CI with `@next/bundle-analyzer`.

### Architecture

NeoBoard is composed of three independent packages:

```
┌──────────────────────────────────────────────────┐
│  app/        Next.js application                 │
│              Glues component + connection         │
│              together with UX, API routes,        │
│              stores, and pages                    │
├──────────────────────┬───────────────────────────┤
│  component/          │  connection/              │
│  React UI library    │  TypeScript DB connector  │
│  Charts, widgets,    │  library with a small     │
│  composed components │  React layer              │
└──────────────────────┴───────────────────────────┘
```

- **`component/`** — Reusable UI component library in React. No business logic, no API calls, no stores.
- **`connection/`** — Database connectivity, query execution, schema fetching in TypeScript. No UI, no app-level concerns.
- **`app/`** — Application logic, API routes, stores, hooks, pages. Orchestrates the other two.

---

## Competitors

| Product | Notes |
|---------|-------|
| Metabase | Open-source BI, no native graph support |
| Apache Superset | Open-source BI, no native graph support |
| NeoDash Commercial | Neo4j-only, no hybrid database architecture |

---

## Feature Categories

### 1. User Management

| # | Feature | Enterprise |
|---|---------|:----------:|
| 1.1 | **Account Registration** — Users can create an account and authenticate with email/password | |
| 1.2 | **SSO Authentication** — Single Sign-On via SAML/OIDC providers | Enterprise |
| 1.3 | **Role-Based Access Control** — Users are assigned roles that govern their permissions | |
| 1.3.1 | **Admin** — Can manage users and CRUD all dashboards. Has write query permission by default | |
| 1.3.2 | **Creator** — Can CRUD dashboards | |
| 1.3.3 | **Reader** — Read-only access to dashboards | |
| 1.3.4 | **Custom Roles** — Define custom permission sets via a capability model (see Enterprise RBAC) | Enterprise |
| 1.4 | **Write Permission** — A `can_write` boolean on each user controls whether they can execute write queries (Form widgets). Admins have this enabled by default. For all other roles, an Admin toggles it per user. Enforced server-side in the write query API route | |
| 1.5 | **PostgreSQL Storage** — All user data, roles, and permissions stored in PostgreSQL | |

#### Enterprise RBAC (future)

In the enterprise package, the hardcoded roles and `can_write` boolean are replaced with a full capability model:

```
Capabilities:
  dashboards:create, dashboards:read, dashboards:update, dashboards:delete
  connectors:create, connectors:read, connectors:update, connectors:delete
  users:manage
  queries:execute_read
  queries:execute_write
```

Default roles (Admin, Creator, Reader) become named capability sets. Custom roles are any admin-defined combination of capabilities. Migration from V1 is straightforward: existing role + `can_write` boolean maps directly to the capability model.

---

### 2. Connectors Management

| # | Feature | Enterprise |
|---|---------|:----------:|
| 2.1 | **Create Connectors** — Admin-only. Configure connections to external databases | |
| 2.2 | **Supported Databases** — PostgreSQL and Neo4j. Extensible architecture for future connectors | |
| 2.3 | **Encrypted Secrets** — Connection credentials stored using envelope encryption (AES-256-GCM). See [Credential Encryption & Key Management](#credential-encryption--key-management) for full design | |
| 2.4 | **Connection Status** — Backend tracks real-time status per connector: Connected, Failed, Connecting, etc. | |
| 2.5 | **Connector Labels** — Tag connectors with labels (e.g., `staging`, `production`) for environment-based switching | Enterprise |
| 2.6 | **Schema Fetching** — Each connector type can fetch its database schema (tables/columns for PostgreSQL, labels/relationships/properties for Neo4j) for use in code completion and type filtering | |
| 2.7 | **Bulk Import** — Import multiple connectors at once via JSON upload in the UI or by calling the API directly | Enterprise |
| 2.8 | **Connector CRUD API** — Full REST API for managing connectors programmatically | Enterprise |

---

### 3. Widget Builder

| # | Feature | Enterprise |
|---|---------|:----------:|
| 3.1 | **Widget Lab** — Dedicated space to create, test, and save reusable widget templates | |
| 3.2 | **CRUD Widgets** — Create, read, update, and delete saved widget templates | |
| 3.3 | **Connector-Bound** — Each widget template is associated with a connector type, ensuring chart compatibility | |

---

### 4. Dashboard Management

| # | Feature | Enterprise |
|---|---------|:----------:|
| 4.1 | **Dashboard Composition** — Dashboards are composed of Pages, which contain Widgets (cards with charts or parameter selectors) and a Parameters Manager | |
| 4.2 | **Dashboard User Assignment** — Assign dashboards to specific authenticated users, controlling who can view or edit based on their role | |
| 4.3 | **Dashboard Sharing Links** — Generate shareable links for unauthenticated access to dashboards. Write-capable dashboards cannot be shared via public links | Enterprise |
| 4.4 | **Permission-Based CRUD** — Users with the appropriate role can create, read, update, delete, and duplicate dashboards | |
| 4.5 | **Auto-Refresh** — Dashboards can be set to auto-refresh via a toggle and interval picker in the dashboard toolbar. When enabled, all widget queries re-execute at the configured interval. Minimum interval enforced at 30 seconds (UI and server-side). The setting is persisted per dashboard | |
| 4.6 | **Query Result Caching** — In-memory LRU cache keyed by `hash(connectorId, query, params)` with configurable TTL (default 60s). Auto-refresh checks the cache first; explicit user interactions (parameter changes) bypass the cache. Prevents duplicate query execution and reduces load on customer databases | Enterprise |
| 4.7 | **Environment Selector** — A dropdown in the dashboard toolbar lets users switch the active environment tag (e.g., `staging` → `production`). All widgets using connector aliases automatically re-resolve to the connector matching the selected tag and re-execute their queries. Depends on Connector Labels (2.5) and Connector Alias (5.9) | Enterprise |
| 4.8 | **Grid Layout** — Drag-and-drop, resizable card grid powered by `react-grid-layout` for flexible dashboard arrangement | |

---

### 5. Widgets

| # | Feature | Enterprise |
|---|---------|:----------:|
| 5.0 | **Chart-Connector Affinity** — Certain chart types are only available for certain connector types (e.g., Graph chart requires Neo4j) | |
| 5.1 | **Query-Driven Data** — Each widget fetches data from its connector via a user-defined query | |
| 5.2 | **Language-Aware Code Editor** — Query editor provides syntax highlighting and code completion matched to the connector type (Cypher for Neo4j, SQL for PostgreSQL). Completion is powered by the schema store | |
| 5.3 | **Draggable & Resizable** — Widgets can be moved and resized on the page grid in Edit Mode | |
| 5.4 | **Chart Settings** — Each chart type exposes a configurable set of options defined in the component library | |
| 5.5 | **Parameter Binding** — Widgets can reference dashboard-level parameters in their queries. When a parameter changes, the widget re-executes its query and re-renders | |
| 5.6 | **Run & Save Shortcut** — `CMD+Shift` to execute the query and save the widget from the settings panel | |
| 5.7 | **Duplicate Widget** — Duplicate a widget locally within the dashboard, or save it to the Widget Builder for reuse | |
| 5.8 | **Column Mapping** — Each widget has its own mapping configuration so users can assign query result columns to chart axes/dimensions directly from the card | |
| 5.9 | **Connector Alias** — Instead of hardcoding a connector per widget, widgets reference connectors by an optional `alias` field. Admins can swap which physical connector an alias points to, enabling environment switching (e.g., staging → production) without modifying dashboards | Enterprise |

---

### 6. Widget Interactivity

| # | Feature | Enterprise |
|---|---------|:----------:|
| 6.1 | **Click Actions** — Charts can be configured so that clicking an element (e.g., a bar) sets a dashboard parameter to a value from the clicked data point. Configured via a dedicated modal in widget settings | |
| 6.2 | **Rule-Based Styling** — Define conditional styling rules that change chart appearance based on data values (e.g., "if Y > 500, color the bar red"). Configured via a dedicated modal in widget settings | |

---

### 7. Charts

Available chart types:

| # | Chart Type | Description | Neo4j | PostgreSQL |
|---|------------|-------------|:-----:|:----------:|
| 1 | **Table** | Sortable, filterable, paginated data grid with dynamic sizing. Supports click-to-set-parameter on cell click (when configured) | Yes | Yes |
| 2 | **Pie** | Standard and donut pie charts | Yes | Yes |
| 3 | **Graph** | Node-link graph visualization powered by Neo4j NVL. Force-directed, circular, and hierarchical layouts | Yes | No |
| 4 | **Line** | Line charts with optional area fill, smooth/stepped modes | Yes | Yes |
| 5 | **Bar** | Vertical/horizontal bar charts, stacked or grouped | Yes | Yes |
| 6 | **Scatter Plot** | Scatter/bubble plots for correlation analysis | Yes | Yes |
| 7 | **Map** | Geospatial visualization with Leaflet. Markers, clusters, multiple tile layers | Yes | Yes |
| 8 | **JSON** | Raw JSON viewer with expandable tree, search, and copy | Yes | Yes |
| 9 | **Single Value** | Large metric display with optional prefix/suffix, trend indicator, and color thresholds | Yes | Yes |
| 10 | **Parameter Selectors** | Input widgets for setting dashboard parameters: text, dropdown, multi-select, date picker, date range, relative date presets, number range slider, cascading selectors | Yes | Yes |
| 11 | **Form** | Data entry forms that execute write queries against a connector. Requires the connector to have write mode enabled and the user to have `can_write` permission. Supports text, number, date, select, textarea, and checkbox fields with validation. When viewed by a user without write permission, the form renders as read-only with a tooltip | Yes | Yes |

---

### 8. API

| # | Feature | Enterprise |
|---|---------|:----------:|
| 8.0 | **Next.js API Layer** — All API routes built as Next.js Route Handlers | |
| 8.1 | **Authenticated Access** — Every API call requires authentication. Minimal API surface | |
| 8.2 | **External Management** — The application can be fully managed via API, enabling automation and integration with external tools | |
| 8.3 | **API Key Authentication** — Generate API keys for programmatic access without user session tokens | |
| 8.4 | **Live API Documentation** — Swagger UI (or equivalent) with interactive testing for all endpoints | |
| 8.5 | **Testing Strategy** — Evaluate whether the API needs its own integration test suite or if E2E tests provide sufficient coverage | |

---

## Enterprise Package

All features not listed below are included in the open-source edition.

| # | Feature | Category |
|---|---------|----------|
| 1.2 | **SSO Authentication** — SAML/OIDC single sign-on | User Management |
| 1.3.4 | **Custom Roles** — Capability-based RBAC with admin-defined permission sets | User Management |
| 2.5 | **Connector Labels** — Tag connectors with environment labels (e.g., `staging`, `production`) | Connectors |
| 2.7 | **Bulk Import** — Import multiple connectors via JSON upload or API | Connectors |
| 2.8 | **Connector CRUD API** — REST API for programmatic connector management | Connectors |
| 4.3 | **Dashboard Sharing Links** — Public links for unauthenticated dashboard access | Dashboards |
| 4.6 | **Query Result Caching** — In-memory LRU cache to reduce duplicate query execution | Dashboards |
| 4.7 | **Environment Selector** — Dashboard-level tag switcher for environment-based connector resolution | Dashboards |
| 5.9 | **Connector Alias** — Widgets reference aliases; admins swap the underlying connection for environment switching | Widgets |

## License

Open source with an enterprise package for the features listed above.