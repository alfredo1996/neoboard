# NeoBoard `app/` Package — Implementation Guide

> A comprehensive reference for understanding the architecture, data flows, and implementation patterns of the NeoBoard Next.js application.

---

## Table of Contents

1. [Package Overview](#1-package-overview)
2. [Architecture Diagrams](#2-architecture-diagrams)
3. [Directory Structure](#3-directory-structure)
4. [App Router & Page Architecture](#4-app-router--page-architecture)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [API Routes](#6-api-routes)
7. [Database Layer (Drizzle ORM)](#7-database-layer-drizzle-orm)
8. [Query Execution Pipeline](#8-query-execution-pipeline)
9. [State Management (Zustand)](#9-state-management-zustand)
10. [Data Fetching (TanStack Query Hooks)](#10-data-fetching-tanstack-query-hooks)
11. [Component Architecture](#11-component-architecture)
12. [Chart Plugin System](#12-chart-plugin-system)
13. [Parameter System](#13-parameter-system)
14. [Multi-Tenancy](#14-multi-tenancy)
15. [Middleware & Instrumentation](#15-middleware--instrumentation)
16. [Dashboard Import/Export & Migration](#16-dashboard-importexport--migration)
17. [Logging & Observability](#17-logging--observability)
18. [Security Model](#18-security-model)
19. [Extension System](#19-extension-system)
20. [Testing Strategy](#20-testing-strategy)
21. [E2E Test Suite](#21-e2e-test-suite)
22. [Configuration Files](#22-configuration-files)
23. [Key Data Flows (End-to-End)](#23-key-data-flows-end-to-end)
24. [Release 2.0 Features](#24-release-20-features)

---

## 1. Package Overview

The `app/` package is the Next.js 16 application that orchestrates the entire NeoBoard product. It sits at the top of a strict three-package monorepo:

```
app/          — Next.js application (this package)
component/   — React UI library (no business logic, no API calls)
connection/  — Database connector library (no UI, no React)
```

**Key constraint:** `app/` may import from `component/` and `connection/`. Neither of those packages may import from `app/` or from each other.

### Tech Stack Summary

| Concern      | Technology                                           |
| ------------ | ---------------------------------------------------- |
| Framework    | Next.js 16 (App Router, Turbopack dev, Webpack prod) |
| React        | v19 with Server Components                           |
| Language     | TypeScript (strict mode)                             |
| UI Library   | shadcn/ui + Tailwind CSS                             |
| Charts       | ECharts (modular imports)                            |
| Graph Viz    | Neo4j NVL                                            |
| Maps         | Leaflet                                              |
| State        | Zustand v5                                           |
| Server State | TanStack Query v5                                    |
| Auth         | Auth.js v5 (NextAuth)                                |
| ORM          | Drizzle ORM                                          |
| Validation   | Zod                                                  |
| Logging      | Pino                                                 |
| Testing      | Vitest (unit/component) + Playwright (E2E)           |

---

## 2. Architecture Diagrams

### 2.1 High-Level System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              BROWSER                                    │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  Dashboard    │  │  Connection  │  │    User      │  │  Settings  │  │
│  │  Pages        │  │  Manager     │  │  Management  │  │  Pages     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
│         │                 │                  │                │         │
│  ┌──────┴─────────────────┴──────────────────┴────────────────┴──────┐  │
│  │                    REACT COMPONENT LAYER                          │  │
│  │  Zustand Stores (dashboard, widget-editor, parameter, ...)       │  │
│  │  TanStack Query Hooks (use-dashboards, use-connections, ...)     │  │
│  └──────────────────────────────┬────────────────────────────────────┘  │
└─────────────────────────────────┼──────────────────────────────────────┘
                                  │ HTTP (fetch)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          NEXT.JS SERVER                                 │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  EDGE MIDDLEWARE (proxy.ts)                                     │    │
│  │  Auth gate · Request ID · API key validation · JWT decode       │    │
│  └────────────────────────────────┬────────────────────────────────┘    │
│                                   ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  API ROUTES (src/app/api/)                                      │    │
│  │                                                                 │    │
│  │  /connections  /dashboards  /query  /users  /keys  /templates   │    │
│  │                                                                 │    │
│  │  ┌───────────┐  ┌───────────┐  ┌────────────┐  ┌───────────┐   │    │
│  │  │requireSes │  │validateBod│  │handleRoute │  │apiSuccess │   │    │
│  │  │sion()     │  │y()        │  │Error()     │  │/apiError  │   │    │
│  │  └───────────┘  └───────────┘  └────────────┘  └───────────┘   │    │
│  └────────────────────────────────┬────────────────────────────────┘    │
│                                   ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  BUSINESS LOGIC LAYER (src/lib/)                                │    │
│  │                                                                 │    │
│  │  ┌────────────┐  ┌────────────────┐  ┌──────────────────────┐   │    │
│  │  │  Auth      │  │  Query         │  │  Dashboard           │   │    │
│  │  │  --------  │  │  ----------    │  │  ---------           │   │    │
│  │  │  session   │  │  scheduler     │  │  import/export       │   │    │
│  │  │  api-key   │  │  executor      │  │  migration           │   │    │
│  │  │  bootstrap │  │  middleware    │  │  neodash converter   │   │    │
│  │  │  signup    │  │  audit         │  │  optimistic lock     │   │    │
│  │  └────────────┘  └───────┬────────┘  └──────────────────────┘   │    │
│  │                          │                                      │    │
│  │  ┌────────────┐  ┌───────┴────────┐  ┌──────────────────────┐   │    │
│  │  │  Crypto    │  │  Connector     │  │  Extensions          │   │    │
│  │  │  --------  │  │  Adapter       │  │  ---------           │   │    │
│  │  │  encrypt   │  │  ----------    │  │  feature flags       │   │    │
│  │  │  hash      │  │  bridges to    │  │  enterprise hooks    │   │    │
│  │  │  rate-limit│  │  connection/   │  │  plugin registry     │   │    │
│  │  └────────────┘  └───────┬────────┘  └──────────────────────┘   │    │
│  └──────────────────────────┼──────────────────────────────────────┘    │
│                              │                                          │
│  ┌───────────────────────────┴─────────────────────────────────────┐    │
│  │  DATA LAYER                                                     │    │
│  │                                                                 │    │
│  │  ┌──────────────────┐      ┌──────────────────────────────────┐ │    │
│  │  │  Drizzle ORM     │      │  connection/ package             │ │    │
│  │  │  (PostgreSQL)    │      │  (Neo4j driver + pg client)      │ │    │
│  │  │                  │      │                                  │ │    │
│  │  │  Users           │      │  ┌────────────┐ ┌─────────────┐ │ │    │
│  │  │  Dashboards      │      │  │ Neo4j      │ │ PostgreSQL  │ │ │    │
│  │  │  Connections     │      │  │ (Cypher)   │ │ (SQL)       │ │ │    │
│  │  │  API Keys        │      │  └─────┬──────┘ └──────┬──────┘ │ │    │
│  │  │  Audit Log       │      │        │               │        │ │    │
│  │  └────────┬─────────┘      └────────┼───────────────┼────────┘ │    │
│  └───────────┼─────────────────────────┼───────────────┼──────────┘    │
└──────────────┼─────────────────────────┼───────────────┼───────────────┘
               ▼                         ▼               ▼
        ┌──────────────┐          ┌────────────┐  ┌────────────┐
        │  PostgreSQL   │          │   Neo4j    │  │ PostgreSQL │
        │  (app data)   │          │  (user DB) │  │ (user DB)  │
        └──────────────┘          └────────────┘  └────────────┘
```

### 2.2 Request Lifecycle

Every browser request flows through this pipeline:

```
 Browser Request
       │
       ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  1. EDGE MIDDLEWARE (proxy.ts)                              │
 │     ┌──────────────────────────────────────────────────┐    │
 │     │  Generate/propagate x-request-id                 │    │
 │     │          │                                       │    │
 │     │          ▼                                       │    │
 │     │  Is public path? ──yes──▶ PASS THROUGH           │    │
 │     │          │ no                                    │    │
 │     │          ▼                                       │    │
 │     │  Has Bearer nb_* token? ──yes──▶ Validate API    │    │
 │     │          │ no                    key, set headers │    │
 │     │          ▼                           │           │    │
 │     │  Has NextAuth JWT? ──yes──▶ Decode JWT            │    │
 │     │          │ no                   │                │    │
 │     │          ▼                      ▼                │    │
 │     │  REDIRECT ──▶ /login    Force password change?   │    │
 │     │                              │ yes    │ no       │    │
 │     │                              ▼        ▼          │    │
 │     │                    /change-password   CONTINUE    │    │
 │     └──────────────────────────────────────────────────┘    │
 └─────────────────────────────┬───────────────────────────────┘
                               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  2. ROUTE HANDLER                                           │
 │                                                             │
 │  PAGE ROUTES                    API ROUTES                  │
 │  ┌────────────────────┐         ┌────────────────────────┐  │
 │  │  Server Component   │         │  requireSession()      │  │
 │  │  renders page       │         │  validateBody(schema)  │  │
 │  │  with layout.tsx    │         │  permission check      │  │
 │  │  hydrates client    │         │  business logic        │  │
 │  │  components         │         │  apiSuccess/apiError   │  │
 │  └────────────────────┘         └────────────────────────┘  │
 └─────────────────────────────────────────────────────────────┘
                               │
                               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  3. RESPONSE                                                │
 │                                                             │
 │  Pages: HTML with hydration payload                         │
 │  API:   { data, meta } or { error: { code, message } }     │
 │                                                             │
 │  Headers: x-request-id propagated for tracing               │
 └─────────────────────────────────────────────────────────────┘
```

### 2.3 Dashboard Rendering Pipeline

How a dashboard goes from database to pixels:

```
                    ┌──────────────────┐
                    │  GET /api/dash/  │
                    │  boards/[id]     │
                    └────────┬─────────┘
                             │
                  ┌──────────▼──────────┐
                  │   layoutJson (JSONB) │
                  │   from PostgreSQL    │
                  └──────────┬──────────┘
                             │
              ┌──────────────▼──────────────┐
              │   dashboard-store.ts         │
              │   loadDashboard(data)        │
              │                              │
              │   pages[]                    │
              │    ├── page[0].widgets[]     │
              │    ├── page[1].widgets[]     │
              │    └── ...                   │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │   DashboardContainer         │
              │   ┌────────────────────┐     │
              │   │    PageTabs        │     │
              │   │  [Page 1][Page 2]  │     │
              │   └────────────────────┘     │
              │   ┌────────────────────┐     │
              │   │ react-grid-layout  │     │
              │   │                    │     │
              │   │ ┌──────┐ ┌──────┐  │     │
              │   │ │Card  │ │Card  │  │     │
              │   │ │  1   │ │  2   │  │     │
              │   │ └──────┘ └──────┘  │     │
              │   │ ┌──────┐ ┌──────┐  │     │
              │   │ │Card  │ │Card  │  │     │
              │   │ │  3   │ │  4   │  │     │
              │   │ └──────┘ └──────┘  │     │
              │   └────────────────────┘     │
              └──────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
   │ CardContain  │   │ CardContain  │   │ CardContain  │
   │ er (per      │   │ er (per      │   │ er (per      │
   │ widget)      │   │ widget)      │   │ widget)      │
   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
          │                  │                  │
          ▼                  ▼                  ▼
   ┌─────────────────────────────────────────────────┐
   │           PER-WIDGET PIPELINE                    │
   │                                                  │
   │  1. Read widget config from store                │
   │          │                                       │
   │          ▼                                       │
   │  2. useWidgetQuery()                             │
   │     ├── Resolve $params from parameter-store     │
   │     ├── POST /api/query                          │
   │     ├── Priority: P2 (load) or P3 (refresh)     │
   │     └── Cache via TanStack Query                 │
   │          │                                       │
   │          ▼                                       │
   │  3. Data Transform (plugins/transforms/)         │
   │     ├── toRecords() normalize format             │
   │     ├── resolveLabelKey() pick x-axis            │
   │     ├── resolveValueKeys() pick y-axis           │
   │     └── Chart-specific transform                 │
   │          │                                       │
   │          ▼                                       │
   │  4. Dispatch to renderer by chartType            │
   │     ├── "bar","line","pie"...  → ChartRenderer   │
   │     │                            → ECharts       │
   │     ├── "table"               → TableRenderer    │
   │     ├── "form"                → FormRenderer     │
   │     ├── "graph"               → GraphExplorer    │
   │     │                           (Neo4j NVL)      │
   │     ├── "map"                 → MapRenderer      │
   │     │                           (Leaflet)        │
   │     ├── "parameter-select"    → ParamRenderer    │
   │     └── "markdown","json",    → ContentRenderer  │
   │         "iframe"                                 │
   └──────────────────────────────────────────────────┘
```

### 2.4 Query Execution Deep Dive

The full lifecycle of a query from click to chart:

```
  User clicks widget    User loads page     Auto-refresh timer
  (interactive)         (initial render)    (background)
       │                      │                   │
       ▼                      ▼                   ▼
    Priority: P1           Priority: P2        Priority: P3
       │                      │                   │
       └──────────────────────┼───────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  POST /api/query              │
              │  {                            │
              │    connectionId,              │
              │    query,                     │
              │    params: { $name: value },  │
              │    priority: 1|2|3,           │
              │    cacheConfig               │
              │  }                            │
              └───────────────┬───────────────┘
                              │
              ┌───────────────▼───────────────┐
              │  API ROUTE                     │
              │  requireSession()              │
              │  validateBody(Zod schema)      │
              │  Lookup connection             │
              │  Decrypt credentials (AES-256) │
              └───────────────┬───────────────┘
                              │
       ┌──────────────────────▼──────────────────────┐
       │            MIDDLEWARE PIPELINE                │
       │                                              │
       │  ┌────────────────────────────────────────┐  │
       │  │  SCHEDULER (per-connector instance)    │  │
       │  │                                        │  │
       │  │  Queue depth < max?                    │  │
       │  │   no ──▶ QueueRejectedError (503)      │  │
       │  │   yes                                  │  │
       │  │    │                                   │  │
       │  │  P3 + fill ratio > 0.8?                │  │
       │  │   yes ──▶ QueueRejectedError/shed (503)│  │
       │  │   no                                   │  │
       │  │    │                                   │  │
       │  │  Wait for slot (P1 > P2 > P3)          │  │
       │  │  Round-robin within same priority       │  │
       │  │    │                                   │  │
       │  │  Wait > 15s?                           │  │
       │  │   yes ──▶ QueueTimeoutError (408)       │  │
       │  │   no                                   │  │
       │  │    ▼                                   │  │
       │  │  SLOT ACQUIRED                         │  │
       │  └────────────────────┬───────────────────┘  │
       │                       │                      │
       │  ┌────────────────────▼───────────────────┐  │
       │  │  AUDIT (pre-execution)                 │  │
       │  │  Log: userId, query, connectionId      │  │
       │  └────────────────────┬───────────────────┘  │
       │                       │                      │
       │  ┌────────────────────▼───────────────────┐  │
       │  │  CORE EXECUTOR                         │  │
       │  │                                        │  │
       │  │  ┌──────────────────────────────────┐  │  │
       │  │  │  1. Substitute $params            │  │  │
       │  │  │     $country → "USA"              │  │  │
       │  │  │     (parameterized, never concat) │  │  │
       │  │  └──────────────┬───────────────────┘  │  │
       │  │                 │                      │  │
       │  │  ┌──────────────▼───────────────────┐  │  │
       │  │  │  2. Connection Adapter            │  │  │
       │  │  │     app/ → connection/ bridge     │  │  │
       │  │  └──────────────┬───────────────────┘  │  │
       │  │                 │                      │  │
       │  │  ┌──────────────▼───────────────────┐  │  │
       │  │  │  3. Driver Execution              │  │  │
       │  │  │                                   │  │  │
       │  │  │  PostgreSQL:                      │  │  │
       │  │  │    BEGIN READ ONLY                │  │  │
       │  │  │    statement_timeout (30s)        │  │  │
       │  │  │    Cursor: MAX_ROWS+1 pattern     │  │  │
       │  │  │                                   │  │  │
       │  │  │  Neo4j:                           │  │  │
       │  │  │    Read access mode               │  │  │
       │  │  │    Native timeout (30s)           │  │  │
       │  │  │    Stream consumption limit       │  │  │
       │  │  └──────────────┬───────────────────┘  │  │
       │  └────────────────────┬───────────────────┘  │
       │                       │                      │
       │  ┌────────────────────▼───────────────────┐  │
       │  │  AUDIT (post-execution)                │  │
       │  │  Log: duration, rowCount, success/fail │  │
       │  └────────────────────┬───────────────────┘  │
       └───────────────────────┼──────────────────────┘
                               │
               ┌───────────────▼───────────────┐
               │  RESPONSE                      │
               │  {                             │
               │    data: {                     │
               │      columns: ["name","val"],  │
               │      rows: [[...], [...]],     │
               │      resultId: "abc123"        │
               │    },                          │
               │    meta: {                     │
               │      cached: false,            │
               │      duration: 142             │
               │    }                           │
               │  }                             │
               └───────────────────────────────┘
```

### 2.5 State Management Data Flow

How data flows between stores, hooks, and components:

```
┌─────────────────────────────────────────────────────────────────────┐
│                          COMPONENT LAYER                            │
│                                                                     │
│  DashboardContainer    WidgetEditorModal    ParameterWidgets        │
│  CardContainer         ChartTypeSelector    ParamSelect/Date/Text   │
│  ChartRenderer         FieldSelector        CascadingSelect         │
│  TableRenderer         StylingRulesEditor                           │
│  FormRenderer          ActionRulesEditor                            │
└───────┬──────────────────────┬──────────────────────┬───────────────┘
        │ read/write           │ read/write           │ read/write
        ▼                      ▼                      ▼
┌───────────────┐  ┌───────────────────┐  ┌───────────────────┐
│  dashboard-   │  │  widget-editor-   │  │  parameter-       │
│  store        │  │  store            │  │  store             │
│               │  │                   │  │                    │
│  pages[]      │  │  chartType        │  │  values{}          │
│  activePage   │  │  query            │  │  visibility{}      │
│  editMode     │  │  connectionId     │  │  dependencies{}    │
│  version      │  │  chartOptions     │  │                    │
│  isDirty      │  │  clickActions[]   │  │  setValue()        │
│               │  │  stylingRules[]   │  │  clearCascading()  │
│  addWidget()  │  │  transforms[]     │  │  resetAll()        │
│  updateWdgt() │  │  formFields[]     │  │                    │
│  setLayout()  │  │                   │  └─────────┬─────────┘
└───────┬───────┘  └─────────┬─────────┘            │
        │                    │                      │
        │    ┌───────────────┘                      │
        │    │  (save widget config                 │
        │    │   back to dashboard)                 │
        │    │                                      │
        ▼    ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       TANSTACK QUERY HOOKS                          │
│                                                                     │
│  useDashboard(id)         useConnections()       useWidgetQuery()   │
│  useUpdateDashboard()     useSchema()            useSeedQuery()     │
│  useCreateDashboard()     useUsers()             useWriteQuery()    │
│  useExportDashboard()     useApiKeys()           useQueryExec()     │
│  useShareDashboard()      useWidgetTemplates()                      │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ fetch()
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          API ROUTES                                 │
│  /api/dashboards  /api/connections  /api/query  /api/users          │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.6 Monorepo Package Dependency

Strict boundary enforcement — arrows show allowed import directions:

```
  ┌──────────────────────────────────────────────────────┐
  │                    app/ (Next.js)                     │
  │                                                      │
  │  Pages · API Routes · Stores · Hooks · Plugins       │
  │  Orchestrates everything. Owns business logic.       │
  │                                                      │
  └───────────┬──────────────────────┬───────────────────┘
              │ imports              │ imports
              ▼                      ▼
  ┌──────────────────────┐  ┌──────────────────────┐
  │   component/         │  │   connection/         │
  │                      │  │                       │
  │   React UI library   │  │   DB connector lib    │
  │   shadcn/ui          │  │   Neo4j driver        │
  │   ECharts wrappers   │  │   PostgreSQL client   │
  │   DataGrid           │  │   Query execution     │
  │   Form widgets       │  │   Schema fetching     │
  │   Chart options      │  │   Connection pooling  │
  │                      │  │                       │
  │   NO business logic  │  │   NO UI / NO React    │
  │   NO API calls       │  │   NO imports from     │
  │   NO stores          │  │   app/ or component/  │
  │   NO imports from    │  │                       │
  │   app/ or connection/│  │                       │
  └──────────────────────┘  └──────────────────────┘
              ▲                      ▲
              │                      │
              ╳ FORBIDDEN            ╳ FORBIDDEN
              │                      │
              └──────────────────────┘
          (cannot import each other)
```

### 2.7 Authentication & Tenant Isolation

```
                         ┌──────────────┐
                         │   Browser    │
                         └──────┬───────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
   ┌──────────────┐   ┌──────────────┐    ┌──────────────┐
   │  Credentials │   │ NextAuth JWT │    │  API Key     │
   │  (login)     │   │ (session)    │    │  Bearer nb_* │
   └──────┬───────┘   └──────┬───────┘    └──────┬───────┘
          │                  │                    │
          ▼                  ▼                    ▼
   ┌──────────────────────────────────────────────────────┐
   │                    proxy.ts                           │
   │          Extracts: userId, role, tenantId             │
   └──────────────────────┬───────────────────────────────┘
                          │
                          ▼
   ┌──────────────────────────────────────────────────────┐
   │  requireSession() → { userId, role, tenantId }       │
   └──────────────────────┬───────────────────────────────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
      │  admin   │  │ creator  │  │  reader  │
      │          │  │          │  │          │
      │ All CRUD │  │ Own CRUD │  │ Shared   │
      │ All users│  │ Shared R │  │ read-only│
      │ Reassign │  │ Own conn │  │ No conn  │
      └──────────┘  └──────────┘  └──────────┘
                          │
                          ▼
   ┌──────────────────────────────────────────────────────┐
   │  EVERY QUERY includes: WHERE tenant_id = $tenantId   │
   │                                                      │
   │  ┌──────────────┐  ┌──────────────┐                  │
   │  │ Tenant: acme │  │ Tenant: glob │   Completely     │
   │  │              │  │              │   isolated.      │
   │  │ Users        │  │ Users        │   No cross-      │
   │  │ Dashboards   │  │ Dashboards   │   tenant access  │
   │  │ Connections  │  │ Connections  │   possible via    │
   │  │ API Keys     │  │ API Keys     │   the API.       │
   │  └──────────────┘  └──────────────┘                  │
   └──────────────────────────────────────────────────────┘
```

### 2.8 Widget Editor Flow

How a widget is configured and saved:

```
  User clicks "Edit Widget" (or "Add Widget")
       │
       ▼
  ┌────────────────────────────────────────────────────────────┐
  │  widget-editor-store.open(widgetId, currentConfig)         │
  └──────────────────────────┬─────────────────────────────────┘
                             │
  ┌──────────────────────────▼─────────────────────────────────┐
  │                   WidgetEditorModal                         │
  │                                                             │
  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────────┐  │
  │  │ Query   │  │ Chart   │  │ Styling │  │  Actions     │  │
  │  │ Tab     │  │ Tab     │  │ Tab     │  │  Tab         │  │
  │  └────┬────┘  └────┬────┘  └────┬────┘  └──────┬───────┘  │
  │       │            │            │               │          │
  │       ▼            ▼            ▼               ▼          │
  │  ┌─────────┐ ┌──────────┐ ┌──────────┐  ┌─────────────┐   │
  │  │SQL/Cyph │ │ChartType │ │Condition │  │Click action │   │
  │  │editor   │ │Selector  │ │al color  │  │rules (nav,  │   │
  │  │         │ │          │ │rules     │  │set param)   │   │
  │  │Connecti │ │Field     │ │          │  │             │   │
  │  │on pick  │ │Mapping   │ │Threshold │  │Target page  │   │
  │  │         │ │          │ │editor    │  │Target param │   │
  │  │Param    │ │Chart     │ │          │  │             │   │
  │  │binding  │ │Options   │ │          │  │             │   │
  │  └────┬────┘ └────┬─────┘ └─────┬────┘  └──────┬──────┘   │
  │       │           │             │               │          │
  │       └───────────┴──────┬──────┴───────────────┘          │
  │                          │                                 │
  │  ┌───────────────────────▼──────────────────────────────┐  │
  │  │           LIVE PREVIEW PANEL                         │  │
  │  │                                                      │  │
  │  │  Executes query with P1 priority on every change     │  │
  │  │  Applies transforms → renders chart preview          │  │
  │  │  Shows column mapping overlay                        │  │
  │  └──────────────────────────────────────────────────────┘  │
  └──────────────────────────┬─────────────────────────────────┘
                             │
                      User clicks "Save"
                             │
                             ▼
  ┌──────────────────────────────────────────────────────────┐
  │  1. widget-editor-store → extract final config           │
  │  2. dashboard-store.updateWidget(widgetId, config)       │
  │  3. dashboard-store.isDirty = true                       │
  └──────────────────────────┬───────────────────────────────┘
                             │
                   User clicks "Save Dashboard"
                             │
                             ▼
  ┌──────────────────────────────────────────────────────────┐
  │  useUpdateDashboard()                                    │
  │  PUT /api/dashboards/[id]                                │
  │  body: { layoutJson, expectedVersion }                   │
  │                                                          │
  │  Server: version match? ──no──▶ 409 CONFLICT             │
  │                          yes                             │
  │                           │                              │
  │                    version + 1                           │
  │                    return updated dashboard              │
  │                                                          │
  │  Client: dashboard-store.isDirty = false                 │
  └──────────────────────────────────────────────────────────┘
```

### 2.9 Parameter Cascading Flow

```
  Dashboard Parameters:
  ┌────────────────────────────────────────────────────────┐
  │                                                        │
  │   [Country ▼]  ──depends──▶  [State ▼]  ──depends──▶  [City ▼]    │
  │    $country                   $state                  $city       │
  │                                                        │
  └────────────────────────────────────────────────────────┘

  User selects Country = "USA"
       │
       ▼
  parameter-store.setValue("country", "USA")
       │
       ├──▶ parameter-store.clearCascading("country")
       │         │
       │         ├──▶ clear "state" value
       │         └──▶ clear "city" value
       │
       ├──▶ State widget: seed query re-executes
       │    SELECT DISTINCT state FROM geo WHERE country = $country
       │         │
       │         ▼
       │    Dropdown repopulates: [California, Texas, New York, ...]
       │
       └──▶ All widgets with $country re-execute their queries
            (P1 priority since user-initiated)

  User selects State = "California"
       │
       ├──▶ parameter-store.clearCascading("state")
       │         └──▶ clear "city" value
       │
       ├──▶ City widget: seed query re-executes
       │    SELECT DISTINCT city FROM geo WHERE state = $state
       │
       └──▶ All widgets with $state or $city re-execute
```

---

## 3. Directory Structure

```
app/
├── src/
│   ├── app/                    # Next.js App Router (pages, layouts, API routes)
│   │   ├── layout.tsx          # Root layout (HTML shell, Providers)
│   │   ├── globals.css         # Global styles
│   │   ├── (auth)/             # Public auth pages (login, signup, change-password)
│   │   ├── (dashboard)/        # Protected pages (main app shell)
│   │   │   ├── layout.tsx      # Sidebar + AppShell wrapper
│   │   │   ├── page.tsx        # Dashboard home
│   │   │   ├── [id]/           # View/edit individual dashboard
│   │   │   ├── dashboards/     # Dashboard listing
│   │   │   ├── connections/    # Connection management
│   │   │   ├── users/          # User management (admin)
│   │   │   ├── widget-library/ # Reusable widget templates
│   │   │   └── settings/       # Profile, API keys
│   │   └── api/                # API route handlers
│   │       ├── auth/           # NextAuth + bootstrap
│   │       ├── connections/    # CRUD + test + schema
│   │       ├── dashboards/     # CRUD + share + import/export
│   │       ├── query/          # Query execution (read + write)
│   │       ├── users/          # User CRUD + password management
│   │       ├── keys/           # API key management
│   │       ├── widget-templates/ # Saved chart templates
│   │       ├── features/       # Feature flag endpoint
│   │       ├── docs/           # API documentation
│   │       └── openapi*/       # OpenAPI spec (JSON + HTML)
│   ├── components/             # App-level React components
│   │   ├── card-container.tsx  # Widget container (query + render)
│   │   ├── dashboard-container.tsx  # Dashboard grid layout
│   │   ├── chart-renderer.tsx  # Chart plugin dispatch
│   │   ├── widget-editor/      # Widget configuration modal (16 files)
│   │   ├── parameters/         # Parameter input components (8 files)
│   │   └── providers.tsx       # React context providers
│   ├── hooks/                  # Custom React hooks (TanStack Query wrappers)
│   ├── stores/                 # Zustand state stores
│   ├── lib/                    # Core business logic & utilities
│   │   ├── api/                # API response helpers
│   │   ├── auth/               # Authentication logic
│   │   ├── connector/          # Connection adapter bridge
│   │   ├── crypto/             # Hashing, rate limiting
│   │   ├── dashboard/          # Import/export, migration, conversion
│   │   ├── db/                 # Drizzle schema & client
│   │   ├── extensions/         # Enterprise extension points
│   │   ├── features/           # Feature flags
│   │   ├── parameter/          # Parameter extraction & formatting
│   │   ├── plugin/             # Chart plugin registry types
│   │   ├── query/              # Query executor, scheduler, middleware
│   │   ├── shared/             # Date utils, normalization, parsing
│   │   ├── widget/             # Widget helpers (actions, forms, tables)
│   │   └── logger.ts           # Pino structured logger
│   ├── plugins/                # Built-in chart type plugins (17 types)
│   ├── types/                  # TypeScript type augmentations
│   ├── instrumentation.ts      # Next.js cold-start bootstrap
│   └── proxy.ts                # Edge middleware (auth, request ID)
├── e2e/                        # Playwright E2E tests (39 spec files)
├── drizzle/                    # Database migration files
├── scripts/                    # Build/utility scripts
├── next.config.ts
├── vitest.config.ts
├── playwright.config.ts
└── package.json
```

---

## 4. App Router & Page Architecture

### Route Groups

NeoBoard uses two route groups to separate public and protected pages:

**`(auth)/` — Public pages (no authentication required)**

- `/login` — Email/password login form
- `/signup` — New user registration (when allowed)
- `/change-password` — Forced password change for new accounts

**`(dashboard)/` — Protected pages (authentication required)**

- `/` — Dashboard home (redirects to default or first dashboard)
- `/[id]` — View a specific dashboard
- `/[id]/edit` — Edit a specific dashboard (drag widgets, configure)
- `/dashboards` — List all accessible dashboards
- `/connections` — Manage database connections
- `/users` — User management (admin only)
- `/widget-library` — Reusable widget template library
- `/settings` — User settings hub
- `/settings/profile` — Profile (name, email)
- `/settings/api-keys` — API key management

### Layout Hierarchy

```
layout.tsx (Root)
  ├── Providers (TanStack QueryClient, ThemeProvider, Toaster)
  ├── (auth)/login/page.tsx      — standalone
  └── (dashboard)/layout.tsx     — AppShell with sidebar
       ├── Sidebar (navigation, connection selector)
       └── Main content area
            ├── page.tsx / [id]/page.tsx
            ├── dashboards/page.tsx
            └── ...
```

The root `layout.tsx` wraps everything in `<Providers>` which sets up:

- TanStack Query client (with default stale times)
- Theme context (light/dark/system)
- Toast notification system
- Session provider (Auth.js)

The `(dashboard)/layout.tsx` adds the persistent sidebar with navigation links, connection selector, and user menu.

---

## 5. Authentication & Authorization

### Auth Stack

| Component       | File                          | Purpose                                                       |
| --------------- | ----------------------------- | ------------------------------------------------------------- |
| NextAuth config | `lib/auth/config.ts`          | Credentials provider, DrizzleAdapter, JWT callbacks           |
| Session helper  | `lib/auth/session.ts`         | `requireSession()` — extracts userId, role, tenantId from JWT |
| API key auth    | `lib/auth/api-key.ts`         | Generate/validate `nb_*` bearer tokens                        |
| Password rules  | `lib/auth/password-schema.ts` | Zod schema for password validation                            |
| Bootstrap       | `lib/auth/bootstrap.ts`       | Create first admin from env vars                              |
| Signup          | `lib/auth/signup.ts`          | User registration flow                                        |
| Rate limiter    | `lib/crypto/rate-limiter.ts`  | Token bucket (20 attempts/min/IP for login)                   |

### Authentication Flow

```
Browser Request
  │
  ▼
proxy.ts (Edge Middleware)
  ├── Public path? → pass through
  ├── Has Bearer nb_* token? → validate API key → set x-user-id header
  ├── Has NextAuth JWT? → decode → check force_password_change
  └── None? → redirect to /login?callbackUrl=...
  │
  ▼
API Route
  │
  requireSession() → extracts { userId, role, tenantId } from JWT/headers
  │
  ▼
  Permission check (role-based: admin, creator, reader)
```

### Roles & Permissions

| Role        | Dashboards             | Connections          | Users     | API Keys | Write Queries              |
| ----------- | ---------------------- | -------------------- | --------- | -------- | -------------------------- |
| **admin**   | Full CRUD + all users' | Full CRUD + reassign | Full CRUD | Own keys | Yes (if connection allows) |
| **creator** | Own CRUD + shared read | Own CRUD             | View self | Own keys | Yes (if connection allows) |
| **reader**  | Shared read only       | None                 | View self | Own keys | No                         |

### API Key Authentication

API keys use a `nb_` prefix format. The key is hashed (SHA-256) before storage. Authentication flow:

1. Client sends `Authorization: Bearer nb_xxx`
2. `proxy.ts` extracts and hashes the key
3. Looks up in `api_keys` table
4. Sets `x-user-id` and `x-tenant-id` headers for downstream routes

---

## 6. API Routes

All API routes follow consistent patterns:

### Response Envelope

Every API response uses a standard envelope:

```typescript
// Success
{ data: T, meta?: { total, limit, offset } }

// Error
{ error: { code: string, message: string, details?: unknown } }
```

Helpers: `apiSuccess(data)`, `apiList(data, total, limit, offset)`, `apiError(code, message, status)`

### Route Pattern

```typescript
// Typical API route structure
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireSession(); // Auth check
  const { id } = await params; // Extract path params

  const result = await db.query.dashboards.findFirst({
    where: and(
      eq(dashboards.id, id),
      eq(dashboards.tenantId, session.tenantId), // Tenant isolation
    ),
  });

  if (!result) return apiError("NOT_FOUND", "Dashboard not found", 404);
  return apiSuccess(result);
}
```

### Complete API Surface

#### Connections (`/api/connections`)

| Method | Path                             | Description                               |
| ------ | -------------------------------- | ----------------------------------------- |
| GET    | `/api/connections`               | List connections (filtered by role)       |
| POST   | `/api/connections`               | Create connection (credentials encrypted) |
| GET    | `/api/connections/[id]`          | Get connection details                    |
| PUT    | `/api/connections/[id]`          | Update connection                         |
| DELETE | `/api/connections/[id]`          | Delete connection                         |
| POST   | `/api/connections/[id]/test`     | Test connectivity                         |
| GET    | `/api/connections/[id]/schema`   | Fetch database schema                     |
| GET    | `/api/connections/[id]/usage`    | Usage statistics                          |
| POST   | `/api/connections/[id]/reassign` | Transfer ownership (admin)                |
| POST   | `/api/connections/test-inline`   | Test without saving                       |

#### Dashboards (`/api/dashboards`)

| Method | Path                             | Description                             |
| ------ | -------------------------------- | --------------------------------------- |
| GET    | `/api/dashboards`                | List dashboards (paginated)             |
| POST   | `/api/dashboards`                | Create dashboard                        |
| GET    | `/api/dashboards/[id]`           | Get dashboard + layout JSON             |
| PUT    | `/api/dashboards/[id]`           | Update (optimistic locking via version) |
| DELETE | `/api/dashboards/[id]`           | Delete dashboard                        |
| POST   | `/api/dashboards/[id]/share`     | Manage sharing/permissions              |
| GET    | `/api/dashboards/[id]/export`    | Export as JSON                          |
| POST   | `/api/dashboards/import`         | Import from JSON                        |
| POST   | `/api/dashboards/[id]/duplicate` | Clone dashboard                         |

#### Queries (`/api/query`)

| Method | Path               | Description                                |
| ------ | ------------------ | ------------------------------------------ |
| POST   | `/api/query`       | Execute read query (SELECT)                |
| POST   | `/api/query/write` | Execute write query (INSERT/UPDATE/DELETE) |

#### Users (`/api/users`)

| Method         | Path                             | Description          |
| -------------- | -------------------------------- | -------------------- |
| GET            | `/api/users`                     | List users (admin)   |
| POST           | `/api/users`                     | Create user (admin)  |
| GET/PUT/DELETE | `/api/users/[id]`                | CRUD individual user |
| POST           | `/api/users/[id]/reset-password` | Force password reset |
| GET            | `/api/users/me`                  | Current user info    |
| PUT            | `/api/users/me/password`         | Change own password  |

#### Other

| Method          | Path                         | Description           |
| --------------- | ---------------------------- | --------------------- |
| GET/POST/DELETE | `/api/keys[/id]`             | API key management    |
| CRUD            | `/api/widget-templates[/id]` | Saved chart templates |
| GET             | `/api/features`              | Feature flags         |
| GET             | `/api/docs`                  | API documentation     |
| GET             | `/api/openapi.json`          | OpenAPI spec          |

---

## 7. Database Layer (Drizzle ORM)

### Schema (`lib/db/schema.ts`)

The database uses PostgreSQL with Drizzle ORM. Core tables:

| Table              | Purpose                   | Key Columns                                                                    |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------ |
| `users`            | User accounts             | id, email, name, role, tenantId, forcePasswordChange                           |
| `dashboards`       | Dashboard metadata        | id, title, description, layoutJson, version, ownerId, tenantId                 |
| `connections`      | Database connections      | id, name, type (neo4j/pg), host, port, encryptedCredentials, ownerId, tenantId |
| `dashboard_shares` | Sharing permissions       | dashboardId, userId, permission (view/edit)                                    |
| `api_keys`         | API access tokens         | id, hashedKey, userId, tenantId, expiresAt                                     |
| `widget_templates` | Saved chart configs       | id, name, chartType, config, ownerId                                           |
| `query_audit_log`  | Query execution history   | id, userId, connectionId, query, duration, rowCount, timestamp                 |
| `accounts`         | OAuth accounts (NextAuth) | Standard NextAuth adapter table                                                |
| `sessions`         | Active sessions           | Standard NextAuth adapter table                                                |

### Key Design Decisions

- **`tenantId`** on every table — enables multi-tenancy
- **`layoutJson`** (JSONB) stores the entire dashboard layout — widgets, grid positions, pages, parameters — as a single JSON document rather than normalized tables
- **`version`** column on dashboards enables optimistic locking for concurrent editing
- **Credentials** are encrypted at rest using AES-256-GCM with the `ENCRYPTION_KEY` (a 64-character hex string = 32 bytes) as the key directly (no HKDF derivation, no envelope wrapping); key rotation via `ENCRYPTION_KEY_OLD`
- **Migrations** are forward-only, idempotent, and use advisory locks to prevent concurrent execution

### Connection Initialization

```typescript
// lib/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

---

## 8. Query Execution Pipeline

The query execution system is the most complex subsystem. It handles user-submitted SQL/Cypher queries with safety, scheduling, caching, and audit logging.

### Pipeline Architecture

```
Frontend (use-widget-query hook)
  │
  │  POST /api/query
  ▼
API Route (src/app/api/query/route.ts)
  │
  ├── requireSession()           → Auth check
  ├── validateBody(schema)       → Zod validation
  ├── resolveConnection()        → Decrypt credentials
  │
  ▼
Query Middleware Pipeline (lib/query/pipeline.ts)
  │
  ├── Scheduler Middleware       → Priority queue, concurrency, fairness
  │   ├── P1: Interactive (user click)
  │   ├── P2: Page load (initial render)
  │   └── P3: Auto-refresh (background)
  │
  ├── Audit Middleware           → Log start, query text, user
  │
  ├── Core Executor              → lib/query/query-executor.ts
  │   ├── Parameter substitution → Replace $param_name with values
  │   ├── Connection adapter     → Bridge to connection/ package
  │   └── Driver execution       → Neo4j driver or PostgreSQL client
  │       ├── Read-only mode     → BEGIN READ ONLY (pg) / read access mode (neo4j)
  │       ├── Timeout            → SET LOCAL statement_timeout (pg) / managed-tx timeout (neo4j), default 30s
  │       └── Row limit          → MAX_ROWS+1 cursor pattern
  │
  ├── Audit Middleware           → Log duration, row count, success/failure
  │
  ▼
API Response
  │
  ├── { data: { columns, rows, resultId }, meta: { cached, duration } }
  │
  ▼
Frontend (card-container.tsx)
  │
  ├── Data Transforms            → Group, aggregate, pivot (lib/query/data-transforms.ts)
  ├── Chart Plugin               → Render via ECharts / custom component
  └── Cache                      → TanStack Query cache with configurable TTL
```

### Scheduler (`lib/query/scheduler.ts`)

The scheduler implements a priority queue with per-connector concurrency control and backpressure.

**Architecture:**

- **One scheduler per connector** — `scheduler-registry.ts` lazily creates a scheduler instance per connectionId
- **Priority tiers** — P1 (interactive/user click) > P2 (page load) > P3 (auto-refresh). Higher priority always dequeues first.
- **Per-user fairness** — within the same priority level, round-robin across users prevents one user from starving others
- **Load shedding** — when queue fill ratio exceeds `shedThreshold`, P3 (refresh) queries are rejected immediately to protect interactive queries

**Configuration (environment variables):**

| Variable                 | Default | Purpose                              |
| ------------------------ | ------- | ------------------------------------ |
| `QUERY_MAX_CONCURRENT`   | 10      | Max in-flight queries per scheduler  |
| `QUERY_MAX_PER_USER`     | 5       | Max in-flight per user per scheduler |
| `QUERY_MAX_QUEUE_DEPTH`  | 200     | Queue capacity before rejection      |
| `QUERY_QUEUE_TIMEOUT_MS` | 15000   | Max wait time in queue (ms)          |
| `QUERY_SHED_THRESHOLD`   | 0.8     | Fill ratio that triggers P3 shedding |

**Error types:**

| Error                              | Trigger                                            | HTTP |
| ---------------------------------- | -------------------------------------------------- | ---- |
| `QueueRejectedError("queue_full")` | Queue depth >= `maxQueueDepth`                     | 503  |
| `QueueRejectedError("shed")`       | P3 request when depth >= threshold x maxQueueDepth | 503  |
| `QueueTimeoutError`                | Waiter exceeds `queueTimeoutMs`                    | 408  |

**Metrics (`scheduler-metrics.ts`):**

- Emitted every 30 seconds for non-idle schedulers
- Tracks: queue depth (total + per-priority), active queries, active by user, rejection count, shed count, average wait time
- Log level escalates: info → warn (shed > 0 or fill ratio >= threshold) → error (rejections > 0)

**Stats interface:**

```typescript
interface SchedulerStats {
  queueDepth: number;
  queueDepthByPriority: { p1: number; p2: number; p3: number };
  activeQueries: number;
  activeByUser: Record<string, number>;
  rejectionsTotal: number;
  shedTotal: number;
  avgWaitMs: number;
}
```

### Query Safety Rules

These are **inviolable** constraints enforced at multiple levels:

1. **Never modify user queries** — no LIMIT injection, no query rewriting (except `wrapWithPreviewLimit` for editor preview)
2. **Always parameterized** — user input never interpolated into query strings
3. **Read-only by default** — `BEGIN READ ONLY` (pg) or read access mode (neo4j)
4. **Write requires `can_write`** — enforced server-side, not just UI
5. **Row limits** — cursor-based consumption with MAX_ROWS+1 pattern
6. **Timeouts** — driver/transaction-level enforcement (`SET LOCAL statement_timeout` for pg, managed-transaction timeout for neo4j)
7. **Concurrency** — a bespoke per-connector priority scheduler (`lib/query/scheduler.ts`, one per connectionId via `scheduler-registry.ts`); **not** the `p-queue` npm package. Priority tiers, per-user fairness, `maxConcurrent`/`maxPerUser` caps, backpressure (queue-full → 503) and queue timeouts (`QUERY_*` env vars). The drivers' own connection pools sit underneath

---

## 9. State Management (Zustand)

Six Zustand stores manage client-side state:

### Dashboard Store (`stores/dashboard-store.ts`)

The central store for dashboard state:

```typescript
interface DashboardState {
  // Layout
  pages: Page[]; // Array of dashboard pages
  activePage: number; // Current page index
  editMode: boolean; // Whether in edit mode

  // Metadata
  dashboardId: string | null;
  title: string;
  version: number; // Optimistic locking version

  // Dirty tracking
  isDirty: boolean; // Unsaved changes exist

  // Actions
  addWidget(widget): void;
  removeWidget(widgetId): void;
  updateWidget(widgetId, changes): void;
  duplicateWidget(widgetId): void;
  addPage(): void;
  removePage(index): void;
  renamePage(index, name): void;
  reorderPages(from, to): void;
  setLayout(page, layouts): void; // Grid position updates
  loadDashboard(data): void; // Hydrate from API
  reset(): void;
}
```

### Widget Editor Store (`stores/widget-editor-store.ts`)

Manages the state of the widget configuration modal:

```typescript
interface WidgetEditorState {
  isOpen: boolean;
  widgetId: string | null; // null = creating new
  chartType: string;
  query: string;
  connectionId: string;
  chartOptions: Record<string, unknown>;
  clickActions: ClickAction[];
  stylingRules: StylingRule[];
  transforms: Transform[];
  formFields: FormField[]; // For form widgets
  parameterConfig: ParameterConfig;
  // ... actions for each field
}
```

### Parameter Store (`stores/parameter-store.ts`)

Manages dashboard-wide parameter values:

```typescript
interface ParameterState {
  values: Record<string, ParameterValue>; // Current values
  visibility: Record<string, boolean>; // Show/hide toggles
  dependencies: Record<string, string[]>; // Cascading dependencies

  setValue(name, value): void;
  clearValue(name): void;
  clearCascading(name): void; // Clear dependent params
  resetAll(): void;
  loadDefaults(params): void;
}
```

### Other Stores

| Store              | File                    | Purpose                                                         |
| ------------------ | ----------------------- | --------------------------------------------------------------- |
| Connection Store   | `connection-store.ts`   | Selected connection, connection list cache                      |
| Schema Store       | `schema-store.ts`       | Database schema cache per connection                            |
| Graph Widget Store | `graph-widget-store.ts` | Neo4j graph visualization state (node/edge selection, viewport) |

### Store Design Patterns

- All stores use Zustand v5 with the vanilla API
- Stores are client-side only (`"use client"` directive)
- Dirty tracking via shallow comparison of initial vs current state
- No persistence middleware — state is transient (loaded from API on each page visit)
- Stores never call APIs directly — that's the hooks' job

---

## 10. Data Fetching (TanStack Query Hooks)

14 custom hooks wrap TanStack Query for all API communication. This layer sits between components and API routes.

### Hook Categories

#### CRUD Hooks (return query + mutation objects)

| Hook                    | File                      | API                                   |
| ----------------------- | ------------------------- | ------------------------------------- |
| `useDashboards`         | `use-dashboards.ts`       | `/api/dashboards`                     |
| `useDashboard(id)`      | `use-dashboards.ts`       | `/api/dashboards/[id]`                |
| `useCreateDashboard`    | `use-dashboards.ts`       | `POST /api/dashboards`                |
| `useUpdateDashboard`    | `use-dashboards.ts`       | `PUT /api/dashboards/[id]`            |
| `useDeleteDashboard`    | `use-dashboards.ts`       | `DELETE /api/dashboards/[id]`         |
| `useDuplicateDashboard` | `use-dashboards.ts`       | `POST /api/dashboards/[id]/duplicate` |
| `useExportDashboard`    | `use-dashboards.ts`       | `GET /api/dashboards/[id]/export`     |
| `useImportDashboard`    | `use-dashboards.ts`       | `POST /api/dashboards/import`         |
| `useShareDashboard`     | `use-dashboards.ts`       | `POST /api/dashboards/[id]/share`     |
| `useConnections`        | `use-connections.ts`      | `/api/connections`                    |
| `useUsers`              | `use-users.ts`            | `/api/users`                          |
| `useApiKeys`            | `use-api-keys.ts`         | `/api/keys`                           |
| `useWidgetTemplates`    | `use-widget-templates.ts` | `/api/widget-templates`               |

#### Query Execution Hooks

| Hook                     | File                           | Purpose                                                           |
| ------------------------ | ------------------------------ | ----------------------------------------------------------------- |
| `useWidgetQuery`         | `use-widget-query.ts`          | Execute widget query with parameter resolution, caching, priority |
| `useQueryExecution`      | `use-query-execution.ts`       | Low-level query executor (calls `/api/query`)                     |
| `useWriteQueryExecution` | `use-write-query-execution.ts` | Execute write queries (`/api/query/write`)                        |

#### UI Hooks

| Hook                       | File                             | Purpose                                     |
| -------------------------- | -------------------------------- | ------------------------------------------- |
| `useTheme`                 | `use-theme.ts`                   | Light/dark/system theme preference          |
| `useClickAction`           | `use-click-action.ts`            | Widget click → navigate or set parameter    |
| `useCountdown`             | `use-countdown.ts`               | Auto-refresh countdown timer                |
| `useUnsavedChangesWarning` | `use-unsaved-changes-warning.ts` | Browser warning on unsaved edits            |
| `useSchema`                | `use-schema.ts`                  | Fetch database schema for connection        |
| `useSeedQuery`             | `use-seed-query.ts`              | Execute query to populate parameter options |

### Hook Pattern

```typescript
// Typical CRUD hook pattern
export function useDashboards(limit = 20, offset = 0) {
  return useQuery({
    queryKey: ["dashboards", limit, offset],
    queryFn: () =>
      fetch(`/api/dashboards?limit=${limit}&offset=${offset}`)
        .then((r) => r.json())
        .then((envelope) => envelope.data),
  });
}

export function useCreateDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      fetch("/api/dashboards", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["dashboards"] }),
  });
}
```

---

## 11. Component Architecture

### Core Rendering Chain

The widget rendering pipeline flows through three key components:

```
DashboardContainer
  │
  ├── PageTabs (multi-page navigation)
  │
  └── Grid (react-grid-layout)
       │
       └── CardContainer (per widget)
            │
            ├── useWidgetQuery()          → Execute query
            ├── Data Transforms           → Reshape results
            │
            ├── ChartRenderer             → ECharts-based charts
            │   └── Plugin.component      → bar, line, pie, etc.
            │
            ├── TableRenderer             → Data grid
            ├── FormWidgetRenderer        → Form inputs
            ├── GraphExplorationWrapper   → Neo4j graph (NVL)
            └── ParameterWidgetRenderer   → Parameter inputs
```

### CardContainer (`components/card-container.tsx`)

The most important component — it's the container for every widget on a dashboard:

- Manages query execution lifecycle (loading, error, data states)
- Applies data transforms (group, aggregate, pivot)
- Handles caching configuration
- Dispatches to the correct renderer based on chart type
- Shows error states, empty states, "incompatible data" warnings
- Manages auto-refresh countdown
- Handles click actions (navigate, set parameter)

### Widget Editor (`components/widget-editor/`)

A complex modal with 16 sub-components for configuring widgets:

| File                           | Purpose                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| `widget-editor-modal.tsx`      | Main modal shell with tabs (Query, Chart, Styling, Actions) |
| `query-editor-panel.tsx`       | SQL/Cypher editor with syntax highlighting                  |
| `chart-type-selector.tsx`      | Visual chart type picker grid                               |
| `field-selector-input.tsx`     | Map query columns to chart axes                             |
| `widget-preview-panel.tsx`     | Live preview of chart with current config                   |
| `action-rules-editor.tsx`      | Configure click actions (navigate, set param)               |
| `styling-rules-editor.tsx`     | Conditional color/format rules                              |
| `transform-editor.tsx`         | Data transform pipeline (group by, aggregate)               |
| `form-fields-editor.tsx`       | Form widget field definitions                               |
| `parameter-config-section.tsx` | Parameter binding configuration                             |
| `parameter-preview.tsx`        | Preview parameter values                                    |
| `template-browser.tsx`         | Browse and apply saved templates                            |
| `value-or-param-input.tsx`     | Toggle between literal value and parameter reference        |
| `column-mapping-overlay.tsx`   | Visual column-to-axis mapping                               |
| `use-accordion-crud.ts`        | Reusable hook for accordion-based CRUD lists                |

### Parameter Components (`components/parameters/`)

Eight parameter input types, each with its own component:

| Component                    | Type             | Description                    |
| ---------------------------- | ---------------- | ------------------------------ |
| `param-text.tsx`             | text             | Free-text input                |
| `param-number-range.tsx`     | number_range     | Slider with min/max            |
| `param-date.tsx`             | date             | Date picker                    |
| `param-date-range.tsx`       | date_range       | Start + end date               |
| `param-date-relative.tsx`    | date_relative    | Relative ("last 7 days")       |
| `param-select.tsx`           | select           | Single-select dropdown         |
| `param-multi-select.tsx`     | multi_select     | Multi-select dropdown          |
| `param-cascading-select.tsx` | cascading_select | Parent-child dependent selects |

Supporting hooks:

- `use-param-actions.ts` — parameter mutation actions
- `use-cascading-clear.ts` — clear dependent parameters when parent changes
- `use-seed-query-options.ts` — load options from a database query

---

## 12. Chart Plugin System

### Plugin Registry (`plugins/registry.ts`)

Chart types are registered as plugins at application startup. Each plugin implements a standard interface:

```typescript
interface ChartPluginConfig {
  type: string; // Unique identifier (e.g., "bar")
  label: string; // Display name in chart picker
  component: React.ComponentType<any>; // React component (dynamic import)
  transform: (data: unknown) => unknown; // Raw rows → chart-ready shape
  transformWithMapping?: (data, mapping) => unknown; // With user column overrides
  validate?: (data: unknown) => string | null; // Error string or null
  options?: ChartOptionDef[]; // Chart Options panel fields
  queryHint?: string; // Example + column expectations
  compatibleWith?: ConnectorType[]; // Allowed connector types
  stylingTargets?: { value; label }[]; // Rule-based styling columns
  settingsSchema?: z.ZodType; // Typed settings validation (Zod)
  enrichClickEvent?: (event, row) => event; // Attach chart-specific click fields
  capabilities?: Partial<{
    supportsClickAction: boolean; // Default: true
    supportsStyling: boolean; // Default: false (true if stylingTargets provided)
    isECharts: boolean; // Default: false (for screenshot capture)
    requiresQuery: boolean; // Default: true (false for markdown, form)
  }>;
}
```

### Built-in Plugins (17 chart types)

The `plugins/` directory contains 17 chart type plugins plus 2 shared utility directories:

| Plugin           | Directory                   | Renderer              |
| ---------------- | --------------------------- | --------------------- |
| Bar              | `plugins/bar/`              | ECharts               |
| Line             | `plugins/line/`             | ECharts               |
| Pie              | `plugins/pie/`              | ECharts               |
| Single Value     | `plugins/single-value/`     | Custom                |
| Table            | `plugins/table/`            | DataGrid (component/) |
| Graph            | `plugins/graph/`            | Neo4j NVL             |
| Map              | `plugins/map/`              | Leaflet               |
| Form             | `plugins/form/`             | Custom form inputs    |
| Markdown         | `plugins/markdown/`         | Markdown renderer     |
| JSON             | `plugins/json/`             | JSON tree viewer      |
| Gauge            | `plugins/gauge/`            | ECharts               |
| Sankey           | `plugins/sankey/`           | ECharts               |
| Sunburst         | `plugins/sunburst/`         | ECharts               |
| Radar            | `plugins/radar/`            | ECharts               |
| Treemap          | `plugins/treemap/`          | ECharts               |
| Parameter Select | `plugins/parameter-select/` | Custom select         |
| iFrame           | `plugins/iframe/`           | HTML iframe           |

**Shared utility directories (not chart types):**

- `plugins/transforms/` — Data transform functions per chart type (e.g., `transformToBarData`, `transformToPieData`, `transformToHierarchicalData`). Also includes `shared-utils.ts` (record normalization, column auto-detection) and `hierarchical-utils.ts` (tree-building for sunburst/treemap).
- `plugins/settings/` — Per-plugin Zod settings schemas (e.g., `barSettingsSchema` with orientation, stacked, showValues, colorPalette, etc.)

### Per-Plugin Settings Schema

Each chart type defines a Zod schema for its configurable options:

```typescript
// Example: plugins/bar/settings.ts
export const barSettingsSchema = z
  .object({
    orientation: z.enum(["vertical", "horizontal"]).default("vertical"),
    stacked: z.boolean().default(false),
    showValues: z.boolean().default(false),
    showLegend: z.boolean().default(true),
    barWidth: z.coerce.number().default(0),
    barGap: z.string().default("30%"),
    xAxisLabel: z.string().optional(),
    yAxisLabel: z.string().optional(),
    showGridLines: z.boolean().default(true),
    axisLabelRotation: z.coerce.number().default(-1),
    referenceLines: z.string().optional(),
    enableDataZoom: z.boolean().default(false),
    colorPalette: z.string().optional(),
    colorblindMode: z.boolean().default(false),
  })
  .passthrough();
```

### External Plugin Loading

NeoBoard supports loading third-party chart plugins at build time via a manifest file:

1. A `neoboard-plugins.json` manifest declares external plugins
2. `node scripts/generate-plugin-imports.mjs` generates `external-plugins.generated.ts`
3. At startup, `plugins/index.ts` registers built-in plugins first, then external plugins

```json
// neoboard-plugins.json
{
  "plugins": [
    {
      "type": "custom-chart",
      "label": "Custom Chart",
      "module": "@myorg/neoboard-custom-plugin",
      "overrides": false
    }
  ]
}
```

**Conflict resolution:**

- External plugins without `overrides: true` throw an error if they duplicate a built-in type
- External plugins with `overrides: true` replace the built-in plugin entirely
- After registration, a validation pass ensures every declared chart type has a registered plugin

### ECharts Import Pattern

All ECharts-based plugins use modular imports to minimize bundle size:

```typescript
// Correct: modular imports
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { use } from "echarts/core";

use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

// NEVER: full import
// import * as echarts from "echarts";  ← banned
```

### Dynamic Loading

All chart components use `next/dynamic` with `ssr: false` to prevent server-side rendering:

```typescript
const BarChart = dynamic(() => import("./bar/component"), { ssr: false });
```

Heavy dependencies (NVL for graphs, Leaflet for maps) are only loaded when a widget of that type appears on the current dashboard.

---

## 13. Parameter System

Parameters allow dashboard users to filter data dynamically. They flow through the system as follows:

### Parameter Lifecycle

```
1. Definition (widget editor)
   └── Parameter widget configured with name, type, default value, seed query

2. Storage (dashboard layoutJson)
   └── Parameters stored as part of dashboard layout JSON

3. Runtime (parameter-store.ts)
   └── Current values managed in Zustand store

4. Substitution (query execution)
   └── $param_name in SQL replaced with current value before execution

5. Cascading (dependencies)
   └── Changing parent param clears dependent child params
```

### Parameter Types

| Type               | Input               | Value Format                             |
| ------------------ | ------------------- | ---------------------------------------- |
| `text`             | Free text           | `string`                                 |
| `number_range`     | Slider              | `{ min: number, max: number }`           |
| `date`             | Date picker         | `YYYY-MM-DD`                             |
| `date_range`       | Two date pickers    | `{ start: string, end: string }`         |
| `date_relative`    | Dropdown            | Resolved to absolute dates at query time |
| `select`           | Dropdown (single)   | `string`                                 |
| `multi_select`     | Dropdown (multi)    | `string[]`                               |
| `cascading_select` | Dependent dropdowns | `string` (each level)                    |

### Seed Queries

Select and multi-select parameters can load their options from a database query:

```sql
-- Seed query for a "department" parameter
SELECT DISTINCT department FROM employees ORDER BY department
```

The seed query is executed once when the dashboard loads, and results populate the dropdown options.

### Parameter Extraction (`lib/parameter/collect-parameter-names.ts`)

Scans query text for `$param_name` patterns and returns a list of required parameters. Used by the widget editor to show which parameters a query depends on.

---

## 14. Multi-Tenancy

NeoBoard supports multi-tenant deployment where a single instance serves multiple organizations:

### Implementation

- Every major table has a `tenant_id` column
- `requireSession()` extracts `tenantId` from the JWT
- Every database query includes a tenant filter: `WHERE tenant_id = $tenantId`
- JWT tokens include a `tenantId` claim, validated on every request
- Default tenant: `"default"` (for single-tenant deployments)

### Isolation Guarantees

- Users can only see dashboards, connections, and data within their tenant
- Admin role is scoped to the tenant (a tenant admin cannot see other tenants)
- API keys are scoped to the tenant
- Cross-tenant access is impossible through the API

### SaaS vs On-Prem

The distinction is handled purely through environment variables, never through code branches:

```
MULTI_TENANT=true     → Enable tenant isolation
MULTI_TENANT=false    → Single tenant mode (default)
```

---

## 15. Middleware & Instrumentation

### Edge Middleware (`src/proxy.ts`)

Runs on every request at the edge (before hitting the Node.js server):

1. **Request ID** — Generates or propagates `x-request-id` header
2. **Public paths** — Allows `/login`, `/signup`, `/api/auth/*`, `/api/openapi` without auth
3. **API key auth** — Validates `Bearer nb_*` tokens for API routes
4. **JWT auth** — Validates NextAuth JWT for page routes
5. **Force password change** — Redirects new users to `/change-password`
6. **Unauthenticated** — Redirects to `/login?callbackUrl=...`

### Instrumentation (`src/instrumentation.ts`)

Next.js cold-start hook that runs once per server startup:

1. **Register query middleware** — Audit and scheduler middleware
2. **Start scheduler metrics** — Periodic queue depth reporting
3. **Bootstrap admin** — Create first admin user from `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD` env vars if no users exist

---

## 16. Dashboard Import/Export & Migration

### Export (`lib/dashboard/dashboard-export.ts`)

Exports a dashboard as a self-contained JSON file:

```json
{
  "version": 2,
  "exportedAt": "2026-04-23T...",
  "dashboard": {
    "title": "Sales Dashboard",
    "description": "...",
    "layout": {
      /* pages, widgets, grid positions */
    },
    "settings": {
      /* auto-refresh, theme */
    }
  }
}
```

### Import (`lib/dashboard/dashboard-import.ts`)

Validates and imports a JSON dashboard:

- Schema validation (Zod)
- Version migration if needed
- Connection remapping (imported dashboards reference connections by name, not ID)
- Conflict resolution (skip, overwrite, rename)

### NeoDash Converter (`lib/dashboard/neodash-converter.ts`)

Converts NeoDash v2 dashboard format to NeoBoard format, enabling migration from the legacy tool.

### Layout Migration (`lib/dashboard/migrate-layout.ts`)

Handles forward migration of layout JSON when the schema evolves (v1 → v2, etc.).

---

## 17. Logging & Observability

### Structured Logging (`lib/logger.ts`)

Pino-based structured JSON logging with four dedicated logger instances:

```typescript
import { logger, queryLogger, authLogger, apiLogger } from "@/lib/logger";

logger.info({ dashboardId, userId }, "Dashboard loaded");
queryLogger.info({ connectionId, duration, rowCount }, "Query executed");
authLogger.warn({ email, ip }, "Login failed");
apiLogger.info({ method, path, status, duration }, "API request");
```

### Log Categories

| Logger        | Purpose                        | Key Fields                              |
| ------------- | ------------------------------ | --------------------------------------- |
| `logger`      | General application logs       | requestId, userId                       |
| `queryLogger` | Query execution audit trail    | connectionId, query, duration, rowCount |
| `authLogger`  | Authentication events          | email, ip, action                       |
| `apiLogger`   | API request/response lifecycle | method, path, status, duration          |

### Configuration (environment variables)

| Variable               | Options                  | Default                      | Purpose                            |
| ---------------------- | ------------------------ | ---------------------------- | ---------------------------------- |
| `LOG_LEVEL`            | error, warn, info, debug | info                         | Pino log level                     |
| `LOG_FORMAT`           | json, pretty             | json                         | Output format                      |
| `LOG_OUTPUT`           | stdout, file, both       | stdout                       | Destination                        |
| `LOG_FILE_PATH`        | path                     | `./logs/neoboard.log`        | File location                      |
| `LOG_MAX_SIZE`         | size string              | 50M                          | Rotation threshold                 |
| `LOG_MAX_FILES`        | number                   | 7                            | Retained rotated files             |
| `LOG_ANONYMIZE`        | true, false              | false                        | Enable PII anonymization           |
| `LOG_ANONYMIZE_SECRET` | string                   | `neoboard-log-anonymizer-v1` | HMAC key for deterministic hashing |

### Transport Options (`lib/logger-transports.ts`)

- **Stdout JSON** (default) — synchronous write to fd 1, no transport overhead
- **Stdout pretty** — `pino-pretty` with colorize, HH:MM:ss.l timestamps, strips pid/hostname
- **File output** — `pino-roll` with rotation by size and file count
- **Stdout + File** — multi-target using Pino transport API

### Built-in Field Redaction

Sensitive fields are automatically censored before logging:

```typescript
redact: {
  paths: [
    "password", "passwordHash", "*.password", "*.passwordHash",
    "credentials", "*.credentials",
    "token", "*.token",
    "authorization", "*.authorization"
  ],
  censor: "[REDACTED]"
}
```

### PII Anonymization (`lib/log-anonymizer.ts`)

When `LOG_ANONYMIZE=true`, a Pino `hooks.logMethod` intercept runs on every log call:

| Field Pattern             | Action                                     | Example                       |
| ------------------------- | ------------------------------------------ | ----------------------------- |
| userId, user_id, email    | HMAC-SHA256 hash → `sha256:<16 hex chars>` | `sha256:a1b2c3d4e5f67890`     |
| params, password, token   | Full redaction → `[REDACTED]`              | —                             |
| uri, connectionUri, dbUri | Credential-stripped URL                    | `postgres://***@host:5432/db` |

Hashing is deterministic (keyed HMAC) so the same userId always produces the same hash across the deployment, enabling correlation in anonymized logs without exposing PII.

### Query Audit Trail (`lib/query/middleware/audit.ts`)

Every query execution is logged with:

- Who (userId, tenantId)
- What (query text, parameters)
- Where (connectionId, connection type)
- When (timestamp)
- How long (duration in ms)
- How much (row count)
- Whether it succeeded or failed

---

## 18. Security Model

### Credential Encryption

```
User provides credentials (password, connection string)
  │
  ▼
AES-256-GCM encryption with the raw ENCRYPTION_KEY
  ├── Key: ENCRYPTION_KEY env var (64-char hex string = 32 bytes, used directly — no HKDF)
  ├── Key rotation: ENCRYPTION_KEY_OLD (decrypt-old, re-encrypt-new)
  ├── Unique IV per encryption
  └── Auth tag for integrity
  │
  ▼
Stored encrypted in PostgreSQL (encryptedCredentials column)
```

**Critical:** Lost `ENCRYPTION_KEY` = all credentials unrecoverable.

### Query Safety (enforced at multiple layers)

| Layer              | Mechanism                                                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL injection      | Parameterized queries only. Never interpolate user input.                                                                                                                               |
| Read-only          | `BEGIN READ ONLY` (pg) / read access mode (neo4j) for non-Form widgets                                                                                                                  |
| Write permission   | `can_write` flag checked server-side in API route                                                                                                                                       |
| Row limits         | Cursor/stream with MAX_ROWS+1 pattern                                                                                                                                                   |
| Timeouts           | Driver/transaction-level (`SET LOCAL statement_timeout` for pg, managed-tx timeout for neo4j). Default 30s.                                                                             |
| Concurrency        | Bespoke per-connector priority scheduler (`lib/query/scheduler.ts`); priority tiers, per-user fairness, backpressure (503), queue timeouts. Driver pools underneath. Not `p-queue` npm. |
| Query modification | NEVER modify or wrap user queries (safety enforced at driver level)                                                                                                                     |

### Rate Limiting

Token bucket algorithm (`lib/crypto/rate-limiter.ts`):

- Login: 20 attempts per minute per IP
- API: configurable per-key limits

### Password Security

- Hashed with bcryptjs (cost factor 12)
- Password validation via Zod schema (minimum length, complexity)
- Force password change flag for admin-created accounts

---

## 19. Extension System

### Architecture (`lib/extensions/`)

NeoBoard supports runtime extensions for enterprise features:

```typescript
interface Extension {
  name: string;
  version: string;
  hooks: {
    onQueryExecute?: (ctx) => void; // Before query runs
    onQueryComplete?: (ctx) => void; // After query completes
    onDashboardSave?: (ctx) => void; // Before dashboard save
    onUserLogin?: (ctx) => void; // After login
    // ... more hooks
  };
}
```

### Feature Flags (`lib/features/`)

Enterprise features gated by environment variables:

```typescript
// lib/features/registry.ts
const features = {
  SSO: env("FEATURE_SSO"),
  CUSTOM_ROLES: env("FEATURE_CUSTOM_ROLES"),
  CONNECTOR_LABELS: env("FEATURE_CONNECTOR_LABELS"),
  BULK_IMPORT: env("FEATURE_BULK_IMPORT"),
  DASHBOARD_SHARING_LINKS: env("FEATURE_SHARING_LINKS"),
  QUERY_RESULT_CACHING: env("FEATURE_QUERY_CACHE"),
  // ...
};
```

Route protection:

```typescript
// In an API route
requireFeature("CUSTOM_ROLES"); // 403 if not enabled
```

---

## 20. Testing Strategy

### Test Pyramid

```
         ┌─────────┐
         │   E2E   │  Playwright (39 spec files)
         │ (slow)  │  Real browser, real DB, full flows
        ┌┴─────────┴┐
        │ Component  │  Vitest + jsdom (.test.tsx)
        │  (medium)  │  React Testing Library
       ┌┴───────────┴┐
       │    Unit      │  Vitest + Node (.test.ts)
       │   (fast)     │  Pure functions, stores, API routes
       └─────────────┘
```

### Vitest Configuration (`vitest.config.ts`)

Two project environments:

| Project     | Environment | File Pattern | Use Case                                   |
| ----------- | ----------- | ------------ | ------------------------------------------ |
| `unit`      | Node        | `.test.ts`   | Pure logic, API routes, stores, hooks      |
| `component` | jsdom       | `.test.tsx`  | React component rendering, branch coverage |

### Test Conventions

- Tests live in `__tests__/` next to the file under test
- Every behavior, bug fix, and edge case gets a test
- TDD workflow: Red → Green → Refactor (mandatory)
- Coverage target: 80% per package

### What Gets Tested Where

| Layer            | Tool                    | Examples                                                |
| ---------------- | ----------------------- | ------------------------------------------------------- |
| Pure functions   | Vitest (Node)           | chart-registry, normalize-value, date-utils, query-hash |
| API routes       | Vitest (mocked DB/auth) | Validation, permissions, error codes                    |
| Zustand stores   | Vitest (Node)           | State transitions, cascading logic                      |
| React components | Vitest (jsdom)          | Render, branches, error states                          |
| Full user flows  | Playwright E2E          | Login → create dashboard → add widget → verify data     |

---

## 21. E2E Test Suite

### Spec Files (39 tests)

| Spec File                       | Coverage Area                           |
| ------------------------------- | --------------------------------------- |
| `auth.spec.ts`                  | Login, signup, logout flows             |
| `auth-states.spec.ts`           | Force password change, session expiry   |
| `dashboards.spec.ts`            | Dashboard CRUD operations               |
| `dashboard-metadata.spec.ts`    | Title, description, settings            |
| `dashboard-states.spec.ts`      | Empty, loading, error states            |
| `dashboard-portability.spec.ts` | Import/export JSON                      |
| `dashboard-visibility.spec.ts`  | Sharing, permissions                    |
| `connections.spec.ts`           | Connection CRUD                         |
| `connection-advanced.spec.ts`   | Schema fetch, test connection           |
| `widgets.spec.ts`               | Widget CRUD within dashboard            |
| `widget-states.spec.ts`         | Widget loading, error, empty states     |
| `widget-library.spec.ts`        | Widget template library                 |
| `charts.spec.ts`                | Chart rendering (bar, line, pie, etc.)  |
| `new-charts.spec.ts`            | Newer chart types (gauge, sankey, etc.) |
| `parameters.spec.ts`            | Parameter widgets, binding              |
| `parameter-types.spec.ts`       | All parameter input types               |
| `form-widget.spec.ts`           | Form widget with write queries          |
| `grid.spec.ts`                  | Dashboard grid layout                   |
| `navigation.spec.ts`            | Page navigation, routing                |
| `sidebar-states.spec.ts`        | Sidebar collapse, expand                |
| `theme.spec.ts`                 | Light/dark mode                         |
| `responsive.spec.ts`            | Mobile/tablet breakpoints               |
| `users.spec.ts`                 | User management                         |
| `settings-profile.spec.ts`      | Profile settings                        |
| `api-keys.spec.ts`              | API key management                      |
| `api-docs.spec.ts`              | API documentation page                  |
| `query-safety.spec.ts`          | SQL injection prevention                |
| `write-permissions.spec.ts`     | Write query permission enforcement      |
| `sharing-permissions.spec.ts`   | Dashboard sharing                       |
| `transforms.spec.ts`            | Data transforms                         |
| `styling-rules.spec.ts`         | Conditional formatting                  |
| `auto-refresh.spec.ts`          | Auto-refresh widget data                |
| `code-completion.spec.ts`       | Query editor autocomplete               |
| `content-widgets.spec.ts`       | Markdown, JSON, iframe widgets          |
| `heavy-widgets.spec.ts`         | Graph, map widgets                      |
| `empty-states.spec.ts`          | Empty state illustrations               |
| `design-system.spec.ts`         | Design system compliance                |
| `performance.spec.ts`           | Load time benchmarks                    |
| `import-validation.spec.ts`     | Import validation edge cases            |

### Test Infrastructure

- **Global setup** (`e2e/global-setup.ts`): Starts Docker containers (PostgreSQL, Neo4j), seeds test data
- **Global teardown** (`e2e/global-teardown.ts`): Stops containers
- **Fixtures** (`e2e/fixtures.ts`): Authenticated page, test user, test connection
- **Pages** (`e2e/pages/`): Page Object Model for reusable interactions

---

## 22. Configuration Files

### `next.config.ts`

Key settings:

- **Output:** `standalone` (Docker-optimized)
- **Transpilation:** `@neoboard/components`, `@neoboard/connection`
- **Server externals:** `postgres`, `pg`, `neo4j-driver` (not bundled into serverless)
- **MobX alias:** Single instance for Neo4j NVL compatibility
- **Source maps:** Enabled in production when `E2E_COVERAGE=1`

### `playwright.config.ts`

- **Workers:** 2 (CI) / 4 (local)
- **Timeout:** 30s per test, 5s per assertion
- **Viewport:** Fixed 1280x1024
- **Reporter:** GitHub (CI) / HTML (local)
- **Server coverage:** Collected via `nextcov`

### `vitest.config.ts`

- **Two projects:** `unit` (Node) + `component` (jsdom)
- **Coverage:** v8 provider, text + lcov + json reporters
- **Setup:** `vitest.setup.tsx` for React Testing Library

---

## 23. Key Data Flows (End-to-End)

### Flow 1: User Views a Dashboard

```
1. Browser navigates to /[id]
2. proxy.ts validates JWT → allows request
3. (dashboard)/[id]/page.tsx renders
4. useDashboard(id) fetches GET /api/dashboards/[id]
5. API route: requireSession() → tenant filter → return dashboard + layoutJson
6. dashboard-store.loadDashboard(data) hydrates layout
7. DashboardContainer renders grid with widgets
8. Each CardContainer:
   a. Reads widget config from layout
   b. useWidgetQuery() resolves parameters from parameter-store
   c. POST /api/query with { connectionId, query, params, priority: P2 }
   d. Scheduler queues query → executor runs it → audit logs it
   e. Response arrives → data transforms applied → chart rendered
```

### Flow 2: User Edits a Widget

```
1. User clicks edit icon on widget card
2. widget-editor-store.open(widgetId, currentConfig)
3. WidgetEditorModal renders with tabs:
   - Query: SQL editor + connection selector
   - Chart: type picker + options panel
   - Styling: conditional format rules
   - Actions: click action configuration
4. User modifies query → preview panel re-executes with P1 priority
5. User clicks Save:
   a. widget-editor-store → extract config
   b. dashboard-store.updateWidget(widgetId, newConfig)
   c. dashboard-store.isDirty = true
6. User clicks Save Dashboard:
   a. useUpdateDashboard mutation
   b. PUT /api/dashboards/[id] with layoutJson + version (optimistic lock)
   c. Server checks version matches → updates → increments version
   d. dashboard-store.isDirty = false
```

### Flow 3: Parameter Cascading

```
1. Dashboard has parameters: Country → State → City (cascading)
2. User selects Country = "USA"
   a. parameter-store.setValue("country", "USA")
   b. parameter-store.clearCascading("country") → clears state, city
   c. State param's seed query re-executes: SELECT state FROM geo WHERE country = $country
   d. State dropdown repopulates with US states
3. User selects State = "California"
   a. Same cascade: city param refreshes
4. All widgets with $country, $state, $city in their queries re-execute
```

### Flow 4: Query Execution Pipeline (detailed)

```
Frontend: POST /api/query
  body: { connectionId, query, params, priority, cacheConfig }

API Route:
  1. requireSession() → { userId, tenantId, role }
  2. validateBody(querySchema) → Zod validation
  3. Lookup connection → decrypt credentials
  4. Check can_write if write query
  5. Enter middleware pipeline:

Pipeline:
  ┌─ Scheduler Middleware ─────────────────────┐
  │  - Get/create per-connector queue           │
  │  - Enqueue with priority (P1/P2/P3)        │
  │  - Wait for available slot                  │
  │  - Timeout → QueueTimeoutError              │
  │  - Full → QueueFullError                    │
  └─────────────────────────────────────────────┘
  ┌─ Audit Middleware (pre) ────────────────────┐
  │  - Log: userId, query, connectionId, start  │
  └─────────────────────────────────────────────┘
  ┌─ Core Executor ────────────────────────────┐
  │  1. Substitute $params with values          │
  │  2. Create connection adapter               │
  │  3. Open read-only transaction              │
  │  4. Execute with timeout (statement_timeout)│
  │  5. Stream rows up to MAX_ROWS+1            │
  │  6. Return { columns, rows, truncated }     │
  └─────────────────────────────────────────────┘
  ┌─ Audit Middleware (post) ───────────────────┐
  │  - Log: duration, rowCount, success/failure  │
  └─────────────────────────────────────────────┘

Response → Frontend:
  { data: { columns, rows, resultId }, meta: { cached, duration } }
```

---

## 24. Release 2.0 Features

This section documents major architectural features introduced in the release/2.0 branch.

### Optimistic Locking for Concurrent Dashboard Editing

**Problem:** Two users editing the same dashboard simultaneously could silently overwrite each other's changes.

**Solution:** Version-based optimistic locking on the `dashboards` table.

**How it works:**

1. Dashboard has a `version` integer column (starts at 1)
2. When the frontend saves, it sends `expectedVersion` in the PUT body
3. The server includes `version = expectedVersion` in the UPDATE WHERE clause
4. If another user saved in between, the WHERE matches 0 rows → returns `CONFLICT` error

```typescript
// Server-side (PUT /api/dashboards/[id])
if (expectedVersion !== undefined) {
  conditions.push(eq(dashboards.version, expectedVersion));
}
// On update: version: sql`${dashboards.version} + 1`

// If 0 rows updated:
apiError(
  "CONFLICT",
  "This dashboard was modified by someone else. Reload to see their changes.",
);
```

**Version increment rules:**

- Increments for meaningful edits: name, description, layout, isPublic
- Does NOT increment for thumbnail-only or settings-only saves
- Frontend displays a conflict toast and triggers a dashboard reload

### Widget Reassignment

Allows moving all widgets from one database connection to another, useful when migrating data sources.

**API endpoint:**

```
POST /api/connections/{id}/reassign
Body: { targetConnectionId: string }
Response: { dashboardsUpdated: number, widgetsReassigned: number }
```

**Guards:**

- Source and target must be the same connector type (cannot reassign Neo4j queries to PostgreSQL)
- Non-admin users can only reassign widgets in dashboards they own or have edit access to
- Admin users can reassign across all dashboards in the tenant
- Query compatibility is NOT validated — broken queries fail at runtime

**Implementation:** A single SQL UPDATE walks `layoutJson.pages[].widgets[].connectionId` using `jsonb_set`, swapping matching connection IDs in place.

### Demo Showcases

Four portable example dashboards for demonstration and testing:

| Showcase             | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| `chart-gallery`      | 17 pages, one per registered chart type                        |
| `click-actions`      | Interactive examples, one per click-action type                |
| `transformations`    | Before/after side-by-side per data transform                   |
| `rule-based-styling` | One page per stylable chart with 2-3 realistic threshold rules |

**Storage:** JSON files in `scripts/demo/` with a manifest in `scripts/demo/showcases.mjs`.

**Validation:** Each showcase is validated against `neoboardExportSchema` (dashboard export format), enforcing `formatVersion: 1`, `layout.version: 2`, and `conn_*` portable connection keys.

**Usage:** Consumed by CLI (`cli/src/commands/demo.ts`) for `list`, `seed`, and `reset` subcommands, with `--only` filtering by comma-separated keys.

### Data Transform Pipeline (`plugins/transforms/`)

Each chart type has a dedicated transform function that converts raw query results into chart-ready data shapes:

| Transform                     | Input                         | Output                             |
| ----------------------------- | ----------------------------- | ---------------------------------- |
| `transformToBarData`          | Flat rows                     | `{ categories[], series[] }`       |
| `transformToLineData`         | Flat rows                     | `{ xAxis[], series[] }`            |
| `transformToPieData`          | Flat rows                     | `{ name, value }[]`                |
| `transformToValueData`        | Single row                    | `{ value, label }`                 |
| `transformToGaugeData`        | Single row                    | `{ value, min, max }`              |
| `transformToSankeyData`       | Rows with source/target/value | `{ nodes[], links[] }`             |
| `transformToRadarData`        | Flat rows                     | `{ indicators[], series[] }`       |
| `transformToHierarchicalData` | Flat or nested rows           | `{ name, value, children[] }` tree |
| `transformToGraphData`        | Neo4j paths/nodes/rels        | `{ nodes[], edges[] }`             |
| `transformToMapData`          | Rows with lat/lng             | `{ points[] }`                     |
| `transformToSelectData`       | Flat rows                     | `{ label, value }[]`               |

**Shared utilities (`transforms/shared-utils.ts`):**

- `toRecords(data)` — normalizes Neo4j (array) and PostgreSQL (`{ records }`) formats to flat arrays
- `resolveLabelKey(keys, mapping?)` — auto-detects or uses user-overridden x-axis/label column
- `resolveValueKeys(keys, labelKey, mapping?)` — auto-detects y-axis/series columns
- `normalizeValue(value)` — handles null, undefined, NaN coercion

**Hierarchical transform (`transforms/hierarchical-utils.ts`):**
Handles three input shapes:

1. Pre-hierarchical data (already has `children` array) — pass through
2. Flat with parent column — builds tree using parent pointers
3. Flat name/value pairs — returns as-is with normalized values

---

## Appendix: File Quick Reference

| Purpose               | Key File                                               |
| --------------------- | ------------------------------------------------------ |
| Root layout           | `src/app/layout.tsx`                                   |
| Dashboard shell       | `src/app/(dashboard)/layout.tsx`                       |
| Edge middleware       | `src/proxy.ts`                                         |
| Cold-start bootstrap  | `src/instrumentation.ts`                               |
| Auth config           | `src/lib/auth/config.ts`                               |
| Session helper        | `src/lib/auth/session.ts`                              |
| DB schema             | `src/lib/db/schema.ts`                                 |
| Query executor        | `src/lib/query/query-executor.ts`                      |
| Query scheduler       | `src/lib/query/scheduler.ts`                           |
| Dashboard store       | `src/stores/dashboard-store.ts`                        |
| Parameter store       | `src/stores/parameter-store.ts`                        |
| Widget editor store   | `src/stores/widget-editor-store.ts`                    |
| Widget container      | `src/components/card-container.tsx`                    |
| Widget editor modal   | `src/components/widget-editor/widget-editor-modal.tsx` |
| Dashboard grid        | `src/components/dashboard-container.tsx`               |
| Chart plugin registry | `src/plugins/registry.ts`                              |
| API response helpers  | `src/lib/api/api-response.ts`                          |
| Logger                | `src/lib/logger.ts`                                    |
| Log transports        | `src/lib/logger-transports.ts`                         |
| Log anonymizer        | `src/lib/log-anonymizer.ts`                            |
| Feature flags         | `src/lib/features/registry.ts`                         |
| Scheduler config      | `src/lib/query/scheduler-config.ts`                    |
| Scheduler registry    | `src/lib/query/scheduler-registry.ts`                  |
| Scheduler metrics     | `src/lib/query/scheduler-metrics.ts`                   |
| Audit middleware      | `src/lib/query/middleware/audit.ts`                    |
| External plugins      | `src/plugins/external-plugins.generated.ts`            |
| Data transforms       | `src/plugins/transforms/index.ts`                      |
| Connection reassign   | `src/lib/db/connection-reassign.ts`                    |
| Demo showcases        | `scripts/demo/showcases.mjs`                           |
