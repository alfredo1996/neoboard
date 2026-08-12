# NeoBoard Architecture

## Package Boundaries

```
                    +-----------------------+
                    |       app/            |
                    |  Next.js Application  |
                    |  API routes, stores,  |
                    |  hooks, pages, plugins|
                    +------+--------+-------+
                           |        |
              imports UI   |        |  imports connectors
                           v        v
            +----------------+   +------------------+
            |  component/    |   |  connection/      |
            |  React UI lib  |   |  DB connector lib |
            |  Charts, forms |   |  Neo4j, Postgres  |
            |  shadcn/ui     |   |  Query execution  |
            +-------+--------+   +------------------+
                    |                     ^
                    |  imports types      |
                    +---------------------+
```

**Rules:**

- `connection/` has zero UI or React dependencies
- `component/` has zero business logic, API calls, or store imports
- `app/` orchestrates both — it's the only package that imports from the other two

## Data Flow: Query Execution

```mermaid
sequenceDiagram
    participant U as User
    participant W as Widget (React)
    participant PS as Parameter Store
    participant TQ as TanStack Query
    participant API as /api/query
    participant QE as Query Executor
    participant CM as Connection Module
    participant DB as Database

    U->>W: Views dashboard
    W->>PS: Read parameter values
    W->>TQ: useWidgetQuery(connId, query, params)
    TQ->>TQ: Check cache (queryKey)
    alt Cache miss or stale
        TQ->>API: POST /api/query
        API->>API: requireSession() + decrypt credentials
        API->>QE: executeQuery(type, credentials, queryParams)
        QE->>QE: Get/create cached connection module
        QE->>CM: runQuery(query, params, config)
        CM->>DB: Execute (Cypher or SQL)
        DB-->>CM: Result rows
        CM-->>QE: Parsed records
        QE-->>API: { data, fields }
        API-->>TQ: JSON response
    end
    TQ-->>W: Cached data
    W->>W: plugin.transform(data)
    W->>W: Render chart
```

## Data Flow: Parameter Updates

```mermaid
sequenceDiagram
    participant U as User
    participant PW as Param Widget
    participant PS as Parameter Store
    participant W1 as Widget A
    participant W2 as Widget B
    participant TQ as TanStack Query

    U->>PW: Select value
    PW->>PS: setParameter("region", "US")
    PS->>PS: Persist to localStorage
    PS-->>W1: Zustand subscription fires
    PS-->>W2: Zustand subscription fires
    W1->>TQ: queryKey changed (new params)
    W2->>TQ: queryKey changed (new params)
    TQ->>TQ: Re-fetch both queries
    Note over W1,W2: Charts re-render with filtered data
```

## Authentication Flow

```mermaid
flowchart TD
    REQ[Incoming Request] --> PROXY{proxy.ts<br/>Edge Middleware}

    PROXY -->|Public route| PASS[Pass through]
    PROXY -->|Bearer nb_*| PASSAPI[Pass to route handler]
    PROXY -->|No auth + page| REDIR[Redirect /login]
    PROXY -->|No auth + API| JSON401[401 JSON]
    PROXY -->|Has JWT| CHECK{forcePasswordChange?}

    CHECK -->|Yes + page| PWREDIR[Redirect /change-password]
    CHECK -->|No| PASS

    PASSAPI --> HANDLER[Route Handler]
    PASS --> HANDLER

    HANDLER --> RS{requireSession}
    RS -->|API key| APIKEYVAL[resolveApiKeyAuth<br/>HMAC-SHA256 lookup]
    RS -->|Session| JWTVAL[auth<br/>JWT validation]
    RS --> SESSION[userId, role, tenantId, canWrite]
    SESSION --> BIZ[Business Logic]
```

## Plugin System

```mermaid
flowchart LR
    subgraph Plugin Definition
        COMP[component.tsx<br/>React chart]
        TRANSFORM[transform.ts<br/>Data shaping]
        SETTINGS[settings.ts<br/>Zod schema]
        OPTIONS[options<br/>Chart config UI]
    end

    REG[Plugin Registry] -->|lookup by chartType| PLUGIN[Plugin]
    PLUGIN --> COMP
    PLUGIN --> TRANSFORM
    PLUGIN --> SETTINGS
    PLUGIN --> OPTIONS

    subgraph Rendering
        DATA[Query Result] --> TRANSFORM
        TRANSFORM --> SHAPED[Chart Data]
        SHAPED --> COMP
        SETTINGS --> EDITOR[Widget Editor]
    end
```

**20 chart plugins:** bar, line, pie, gauge, single-value, table, graph, map, json, markdown, form, iframe, sankey, sunburst, radar, treemap, parameter-select, circle-packing, choropleth, heatmap

## State Management

```
+-------------------+     +---------------------+     +------------------+
| Dashboard Store   |     | Widget Editor Store  |     | Parameter Store  |
| (Zustand)         |     | (Zustand)            |     | (Zustand)        |
|                   |     |                      |     |                  |
| - layout (pages,  |     | - chartType          |     | - parameters{}   |
|   widgets, grid)  |     | - connectionId       |     | - localStorage   |
| - activePage      |     | - query              |     |   persistence    |
| - _dirty flag     |     | - chartOptions       |     | - per-dashboard  |
| - CRUD operations |     | - clickActions       |     |   isolation      |
+-------------------+     | - stylingRules       |     +------------------+
                          | - transforms         |
+-------------------+     +---------------------+     +------------------+
| Connection Store  |                                  | Schema Store     |
| (Zustand)         |     +---------------------+     | (Zustand)        |
|                   |     | TanStack Query Cache |     |                  |
| - activeConnId    |     |                      |     | - schemas by     |
| - widget->conn    |     | - dashboards[]       |     |   connectionId   |
|   mapping         |     | - connections[]      |     +------------------+
+-------------------+     | - widget-query[]     |
                          | - users[]            |     +------------------+
                          | - api-keys[]         |     | Graph Widget     |
                          | - widget-templates[] |     | Store (Zustand)  |
                          +---------------------+     |                  |
                                                      | - nodes, edges   |
                                                      | - per-widget     |
                                                      +------------------+
```

## Directory Structure (after lib/ reorg)

```
app/src/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Public: login, signup, change-password
│   ├── (dashboard)/        # Protected: dashboard pages
│   └── api/                # 27 API routes
├── components/             # App-level React components
├── hooks/                  # TanStack Query hooks (20+)
├── stores/                 # Zustand stores (6)
├── plugins/                # Chart plugin definitions (17)
│   ├── transforms/         # Data transform functions
│   └── settings/           # Zod settings schemas
├── lib/
│   ├── api/                # API client, response helpers, OpenAPI
│   ├── auth/               # Session, API key, signup, bootstrap
│   ├── connector/          # Connection adapter, types, schema prefetch
│   ├── crypto/             # AES-256-GCM encryption, rate limiter
│   ├── dashboard/          # Export, import, migrate, thumbnails
│   ├── db/                 # Drizzle ORM client + schema
│   ├── parameter/          # Collect, format, apply defaults
│   ├── plugin/             # Chart registry, helpers
│   ├── query/              # Executor, hash, cache, params, transforms
│   ├── shared/             # Date utils, normalize, parse, URL params
│   └── widget/             # Utils, actions, click, form fields
└── proxy.ts                # Edge middleware (auth guard)

component/src/
├── charts/                 # ECharts wrappers (BaseChart + 14 types)
├── components/
│   ├── ui/                 # 38 shadcn/ui primitives
│   └── composed/           # 43 higher-order components
├── hooks/                  # useWidgetSize, useContainerSize
└── lib/                    # Utilities, design tokens, Cypher language

connection/
├── src/
│   ├── generalized/        # Abstract bases (ConnectionModule, AuthModule, RecordParser)
│   ├── neo4j/              # Neo4j driver implementation
│   ├── postgresql/         # PostgreSQL pg implementation
│   └── schema/             # Schema introspection managers
└── dist/                   # Compiled JS + .d.ts (built via tsc)
```

## Database Schema (key tables)

```
users            connections         dashboards          dashboardShares
+-----------+    +---------------+   +---------------+   +---------------+
| id (PK)   |    | id (PK)       |   | id (PK)       |   | id (PK)       |
| email      |    | userId (FK)   |   | userId (FK)   |   | dashboardId   |
| role       |    | tenantId      |   | tenantId      |   | userId (FK)   |
| canWrite   |    | type (enum)   |   | name          |   | tenantId      |
| tenantId   |    | configEncrypt |   | layoutJson    |   | role (enum)   |
+------------+    | advancedJson  |   | thumbnailJson |   +---------------+
                  +---------------+   +---------------+

apiKeys              widgetTemplates
+---------------+    +---------------+
| id (PK)       |    | id (PK)       |
| userId (FK)   |    | chartType     |
| tenantId      |    | connectorType |
| keyHash       |    | query         |
| expiresAt     |    | settings      |
+---------------+    | tenantId      |
                     +---------------+
```

**Multi-tenancy:** Every table includes `tenantId`. All queries filter by tenant at the ORM level.

**Encryption:** Connection credentials use AES-256-GCM with the `ENCRYPTION_KEY` (a 64-character hex string = 32 bytes) as the key directly (no HKDF derivation, no envelope wrapping); ciphertext is stored as `iv:authTag:ciphertext` (base64), with key rotation via `ENCRYPTION_KEY_OLD`. Lost `ENCRYPTION_KEY` = all credentials unrecoverable.
