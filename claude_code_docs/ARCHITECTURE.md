# NeoBoard - Architecture

> Low-code dashboard builder for Neo4j and other data sources.
> This document describes the system architecture and file structure.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NEOBOARD APP                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         APP SHELL (Layout)                              │ │
│  │  ┌──────────┐  ┌─────────────────────────────┐  ┌───────────────────┐  │ │
│  │  │ Sidebar  │  │        Dashboard            │  │  Settings Panel   │  │ │
│  │  │ - Pages  │  │  ┌─────────────────────────┐│  │  - Card Config    │  │ │
│  │  │ - Cards  │  │  │      Grid Layout        ││  │  - Query Editor   │  │ │
│  │  │ - Params │  │  │  ┌─────┐ ┌─────┐ ┌────┐ ││  │  - Preview        │  │ │
│  │  └──────────┘  │  │  │Card │ │Card │ │Card│ ││  └───────────────────┘  │ │
│  │                │  │  └─────┘ └─────┘ └────┘ ││                          │ │
│  │                │  └─────────────────────────┘│                          │ │
│  │                └─────────────────────────────┘                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
├────────────────────────────────────┼─────────────────────────────────────────┤
│                              OPEN CORE                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ Dashboard    │  │ Card/Report  │  │  Parameter   │  │  Auth & Resource │ │
│  │ Store        │  │ API          │  │  Store       │  │  Manager         │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
│                                    │                                         │
├────────────────────────────────────┼─────────────────────────────────────────┤
│                         CONNECTION MODULE                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    IDataSource Interface                                 ││
│  │     ┌──────────────┬──────────────┬──────────────┬───────────────┐      ││
│  │     │    Neo4j     │  PostgreSQL  │    MySQL     │     REST      │      ││
│  │     │   Adapter    │   Adapter    │   Adapter    │    Adapter    │      ││
│  │     └──────────────┴──────────────┴──────────────┴───────────────┘      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                    │                                         │
├────────────────────────────────────┼─────────────────────────────────────────┤
│                          CHART LIBRARIES                                     │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────────┐ │
│  │ Table  │ │  Bar   │ │  Line  │ │  Pie   │ │ Graph  │ │ SingleValue    │ │
│  │(AG Grid)│ │(ECharts)│ │(ECharts)│ │(ECharts)│ │ (NVL) │ │   (Custom)    │ │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
neoboard/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── index.html
│
├── src/
│   ├── main.tsx                      # Entry point
│   ├── App.tsx                       # Root component with providers
│   │
│   ├── connection/                   # CONNECTION MODULE (external: ../connection)
│   │   ├── src/
│   │   │   ├── index.ts              # Public exports
│   │   │   │
│   │   │   ├── generalized/          # Database-agnostic abstractions
│   │   │   │   ├── interfaces.ts     # AuthConfig, ConnectionConfig, QueryStatus, QueryCallback
│   │   │   │   ├── ConnectionModule.ts      # Abstract base class
│   │   │   │   ├── AuthenticationModule.ts  # Abstract auth handler
│   │   │   │   ├── NeodashRecord.ts         # Result format (unified)
│   │   │   │   ├── NeodashRecordParser.ts   # Parser interface
│   │   │   │   └── uiComponents/
│   │   │   │       ├── ConnectionContext.ts      # React context
│   │   │   │       └── ConnectionProvider.tsx    # Provider component
│   │   │   │
│   │   │   ├── neo4j/                 # Neo4j-specific implementation
│   │   │   │   ├── Neo4jConnectionModule.ts  # Query execution, driver mgmt
│   │   │   │   ├── Neo4jAuthenticationModule.ts # Auth handling
│   │   │   │   ├── Neo4jRecordParser.ts        # Neo4j → NeodashRecord
│   │   │   │   └── utils.ts                     # Helpers
│   │   │   │
│   │   │   └── postgresql/            # PostgreSQL adapter (future)
│   │   │   └── mysql/                 # MySQL adapter (future)
│   │   │   └── rest/                  # REST API adapter (future)
│   │   │
│   │   ├── __tests__/                 # Comprehensive test suite
│   │   │   ├── authentication/
│   │   │   ├── connection/
│   │   │   ├── neo4j/
│   │   │   └── utils/
│   │   │
│   │   └── jest.config.js             # Test configuration
│   │
│   ├── core/                         # OPEN CORE
│   │   ├── index.ts                  # Public exports
│   │   │
│   │   ├── dashboard/
│   │   │   ├── types.ts              # Dashboard, Page, Card types
│   │   │   ├── store.ts              # Dashboard Zustand store
│   │   │   ├── Dashboard.tsx         # Main dashboard component
│   │   │   ├── Page.tsx              # Single page with grid
│   │   │   └── DashboardManager.tsx  # Dashboard list/CRUD
│   │   │
│   │   ├── card/
│   │   │   ├── Card.tsx              # Card wrapper with flip
│   │   │   ├── CardFront.tsx         # Chart render side
│   │   │   ├── CardBack.tsx          # Settings compact view
│   │   │   ├── CardSettings.tsx      # Full settings panel
│   │   │   ├── CardHeader.tsx        # Title and actions
│   │   │   └── ReportAPI.ts          # Card-Chart interface
│   │   │
│   │   ├── grid/
│   │   │   ├── GridLayout.tsx        # react-grid-layout wrapper
│   │   │   └── GridItem.tsx          # Grid item wrapper
│   │   │
│   │   ├── parameters/
│   │   │   ├── store.ts              # Parameter Zustand store
│   │   │   ├── ParameterPanel.tsx    # Parameter sidebar
│   │   │   └── ParameterInput.tsx    # Individual param inputs
│   │   │
│   │   ├── auth/
│   │   │   ├── store.ts              # Auth state
│   │   │   └── db/
│   │   │       └── schema.sql        # SQLite schema
│   │   │
│   │   └── resources/
│   │       ├── store.ts              # Resources store
│   │       ├── ResourceManager.tsx   # Connection management UI
│   │       └── LocalMode.tsx         # localStorage-only mode
│   │
│   ├── charts/                       # CHART LIBRARIES
│   │   ├── index.ts                  # Public exports + registration
│   │   ├── types.ts                  # IChart interface
│   │   ├── registry.ts               # Chart type registry
│   │   │
│   │   ├── table/
│   │   │   ├── TableChart.tsx        # AG Grid implementation
│   │   │   └── settings.ts           # Table settings schema
│   │   │
│   │   ├── bar/
│   │   │   ├── BarChart.tsx          # ECharts bar chart
│   │   │   └── settings.ts           # Bar settings schema
│   │   │
│   │   ├── line/
│   │   │   ├── LineChart.tsx         # ECharts line chart
│   │   │   └── settings.ts           # Line settings schema
│   │   │
│   │   ├── pie/
│   │   │   ├── PieChart.tsx          # ECharts pie chart
│   │   │   └── settings.ts           # Pie settings schema
│   │   │
│   │   ├── graph/
│   │   │   ├── GraphChart.tsx        # Neo4j NVL graph
│   │   │   ├── GraphSettings.tsx     # Node/edge styling UI
│   │   │   └── settings.ts           # Graph settings schema
│   │   │
│   │   ├── single-value/
│   │   │   ├── SingleValue.tsx       # KPI display
│   │   │   └── settings.ts           # KPI settings schema
│   │   │
│   │   └── map/
│   │       ├── MapChart.tsx          # Leaflet map
│   │       └── settings.ts           # Map settings schema
│   │
│   ├── components/                   # Shared UI Components (shadcn)
│   │   ├── ui/                       # shadcn base components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── skeleton.tsx
│   │   │   └── ...
│   │   │
│   │   └── common/                   # Custom reusable components
│   │       ├── ErrorBoundary.tsx
│   │       ├── LoadingSpinner.tsx
│   │       └── ...
│   │
│   ├── lib/
│   │   ├── utils.ts                  # cn(), formatDate, debounce
│   │   ├── storage.ts                # localStorage helpers
│   │   └── crypto.ts                 # Encryption utils
│   │
│   └── types/
│       └── index.ts                  # Global type re-exports
│
└── public/
    └── favicon.svg
```

---

## Core Interfaces

### Connection Module Architecture

The connection module (`../connection/`) is a **standalone npm module** that handles database connections in isolation. It exports a React-ready interface for integration.

#### Core Types (Generalized)
```typescript
// connection/src/generalized/interfaces.ts

export enum AuthType {
  NATIVE = 1,           // Username/password
  SINGLE_SIGN_ON = 2,   // OAuth/LDAP (future)
  EMPTY = 3,            // No auth
}

export interface AuthConfig {
  username: string
  password: string
  authType: AuthType
  uri: string            // e.g., 'bolt://localhost:7687'
}

export interface ConnectionConfig {
  connectionTimeout: number      // ms, default 30s
  timeout: number                // Query timeout, default 2s
  database?: string              // Target database name
  accessMode: 'READ' | 'WRITE'  // Transaction mode
  rowLimit: number               // Max records, default 5000
  connectionType: 'neo4j' | 'postgresql' | 'mysql' | 'rest'
  parseToNeodashRecord: boolean  // Auto-parse results
  useNodePropsAsFields: boolean  // Flatten node properties as fields
}

export enum QueryStatus {
  NO_QUERY,                 // Missing query
  NO_DATA,                  // Query succeeded, zero rows
  NO_DRAWABLE_DATA,         // Data format unsupported
  WAITING,                  // Pre-execution
  RUNNING,                  // In progress
  TIMED_OUT,               // Exceeded timeout
  COMPLETE,                // Success, all data
  COMPLETE_TRUNCATED,      // Success, truncated at rowLimit
  ERROR,                   // Failed execution
}

export interface QueryParams {
  query: string
  params?: Record<string, any>
}

export interface QueryCallback<T> {
  onSuccess?: (result: T) => void
  onFail?: (error: any) => void
  setStatus?: (status: QueryStatus) => void
  setFields?: (fields: any) => void
  setSchema?: (schema: any) => void
}
```

#### Connection Module Interface
```typescript
// connection/src/generalized/ConnectionModule.ts

export abstract class ConnectionModule {
  abstract authModule: AuthenticationModule

  abstract runQuery<T>(
    queryParams: QueryParams,
    callbacks: QueryCallback<T>,
    config: ConnectionConfig
  ): Promise<void>

  abstract checkConnection(connectionConfig: ConnectionConfig): Promise<boolean>
}
```

#### Neo4j-Specific Implementation
```typescript
// connection/src/neo4j/Neo4jConnectionModule.ts

export class Neo4jConnectionModule extends ConnectionModule {
  authModule: Neo4jAuthenticationModule
  private parser: Neo4jRecordParser

  constructor(config: AuthConfig)
  getDriver(): Driver
  async runQuery<T>(
    queryParams: QueryParams,
    callbacks: QueryCallback<T>,
    config: ConnectionConfig
  ): Promise<void>
}
```

#### Result Format (NeodashRecord)
```typescript
// The connection module returns results parsed as NeodashRecord
// This is a standardized format that charts consume

export interface NeodashRecord {
  fields: FieldDef[]           // Column metadata
  records: Record<string, any>[] // Data rows
  summary: {
    rowCount: number
    executionTime: number
    queryType: string
    notifications?: string[]
  }
}
```

#### React Integration
```typescript
// connection/src/generalized/uiComponents/ConnectionProvider.tsx

// Provides useConnection() hook to the entire React tree
<ConnectionProvider>
  <App />
</ConnectionProvider>

// Usage in components
const { execute } = useConnection()
const result = await execute(query, params, connectionId)
```

### IChart (Charts Module)

```typescript
// src/charts/types.ts

export interface IChart {
  type: ChartType
  name: string
  icon: React.ComponentType
  
  // Rendering
  render(data: InternalResult, config: ChartConfig, size: Size): React.ReactElement
  
  // Settings
  getSettingsSchema(): z.ZodObject<any>
  getDefaultConfig(): ChartConfig
  
  // Data transformation
  transformData(raw: InternalResult): ChartData
  
  // Validation
  validateData(data: InternalResult): { valid: boolean; errors: string[] }
  
  // Supported data types
  supportedColumnTypes: ColumnType[]
}

export type ChartType = 'table' | 'bar' | 'line' | 'pie' | 'graph' | 'single-value' | 'map'

export interface ChartConfig {
  title?: string
  refreshInterval?: number
  [key: string]: any  // Type-specific settings
}

export interface Size {
  width: number
  height: number
}
```

### Dashboard Types (Core Module)

```typescript
// src/core/dashboard/types.ts

export interface Dashboard {
  id: string
  title: string
  description?: string
  version: string
  createdAt: Date
  updatedAt: Date
  pages: Page[]
  theme: 'light' | 'dark' | 'system'
  settings: DashboardSettings
}

export interface Page {
  id: string
  title: string
  cards: Card[]
  layout: Layout[]
}

export interface Card {
  id: string
  type: ChartType
  title: string
  connectionId: string
  query: string
  config: ChartConfig
  refreshInterval?: number
}

export interface Layout {
  i: string      // Card ID
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

export interface DashboardSettings {
  editable: boolean
  fullscreenEnabled: boolean
  parametersVisible: boolean
}
```

### Zustand Stores (Main App Layer)

```typescript
// src/core/connection/store.ts - Wraps the connection module
export interface ConnectionState {
  // Connection metadata (app-managed)
  connections: Array<{
    id: string
    name: string
    authConfig: AuthConfig           // From connection module
    connectionConfig: ConnectionConfig // From connection module
    lastConnected?: Date
    status: 'connected' | 'disconnected' | 'error'
  }>
  activeConnectionId: string | null

  // Actions
  addConnection: (name: string, auth: AuthConfig, config: ConnectionConfig) => void
  updateConnection: (id: string, updates: Partial<ConnectionConfig>) => void
  removeConnection: (id: string) => void
  setActiveConnection: (id: string | null) => void

  // Connection status
  connectionStatus: Map<string, QueryStatus>
}

// src/core/dashboard/store.ts
export interface DashboardState {
  dashboard: Dashboard | null
  currentPageIndex: number
  isEditing: boolean
  selectedCardId: string | null
  
  // Actions
  loadDashboard: (id: string) => Promise<void>
  saveDashboard: () => Promise<void>
  addPage: (title: string) => void
  removePage: (index: number) => void
  addCard: (pageIndex: number, card: Partial<Card>) => void
  updateCard: (cardId: string, updates: Partial<Card>) => void
  removeCard: (cardId: string) => void
  updateLayout: (pageIndex: number, layout: Layout[]) => void
}

// src/core/parameters/store.ts
export interface ParameterState {
  parameters: Record<string, any>
  
  // Actions
  setParameter: (name: string, value: any) => void
  getParameter: (name: string) => any
  clearParameters: () => void
  syncToUrl: () => void
  loadFromUrl: () => void
}
```

---

## Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    User      │────▶│   Card UI    │────▶│  Dashboard   │
│  Interaction │     │              │     │    Store     │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                     │
                            ▼                     │
                     ┌──────────────┐             │
                     │  Parameter   │◀────────────┘
                     │    Store     │
                     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   useCypher  │
                     │    Hook      │
                     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐     ┌──────────────┐
                     │  Connection  │────▶│  IDataSource │
                     │   Provider   │     │   Adapter    │
                     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
                                          ┌──────────────┐
                                          │   Database   │
                                          │  (Neo4j etc) │
                                          └──────────────┘
                                                 │
                                                 ▼
                     ┌──────────────┐     ┌──────────────┐
                     │    Chart     │◀────│  Internal    │
                     │  Component   │     │   Result     │
                     └──────────────┘     └──────────────┘
```

---

## Module Responsibilities

### Connection Module (External: ../connection)
**Single Responsibility**: Database abstraction and query execution
- ✅ Abstract connection interface (ConnectionModule base class)
- ✅ Concrete adapters per database (Neo4j implemented, PostgreSQL/MySQL/REST for future)
- ✅ Unified query execution with callbacks
- ✅ Result parsing to NeodashRecord format
- ✅ Authentication handling (native, SSO-ready)
- ✅ Status tracking (QueryStatus enum)
- ✅ Row limiting and truncation
- ✅ Comprehensive test suite
- ❌ NOT responsible for: UI, persistence, dashboard logic, chart rendering

### Core Module (Main App: src/core)
**Responsibility**: Dashboard orchestration and state management
- Connection store (wraps connection module)
- Dashboard CRUD and state management
- Page and card management
- Grid layout and positioning
- Parameter system and substitution
- Persistence layer (SQLite/localStorage)
- Resource management
- Error boundaries and recovery

### Charts Module (src/charts)
**Responsibility**: Data visualization
- Chart type registry
- Data transformation per chart type
- Chart rendering (Table, Bar, Line, Pie, Graph, etc)
- Settings schemas and validation
- Export functionality

### Components Module (src/components)
**Responsibility**: Shared UI patterns
- shadcn base components (button, card, dialog, etc)
- Custom reusable components (loading, error states, etc)
- Layout components (shell, sidebar, panels)

---

## Implementation Status & LOC Estimates

### Connection Module (../connection) - IMPLEMENTED ✅

| Component | Status | Est. LOC |
|-----------|--------|----------|
| Generalized (interfaces, base classes) | ✅ Done | 280 |
| Neo4j adapter (driver, queries, auth) | ✅ Done | 350 |
| Neo4j parser (NeodashRecord conversion) | ✅ Done | 180 |
| Test suite (comprehensive) | ✅ Done | 420 |
| **Subtotal** | | **~1230** |

### Main App (NeoBoard) - TODO

| Module | Submodule | Est. LOC | Priority |
|--------|-----------|----------|----------|
| Core | Connection store (wrapper) | 150 | P0 |
| Core | Dashboard CRUD + store | 800 | P0 |
| Core | Card management | 810 | P0 |
| Core | Grid layout integration | 210 | P0 |
| Core | Parameters system | 400 | P1 |
| Core | Persistence (SQL.js) | 200 | P1 |
| Charts | Registry pattern | 180 | P0 |
| Charts | Table (AG Grid) | 310 | P0 |
| Charts | Bar/Line/Pie (ECharts) | 360 | P0 |
| Charts | Graph (NVL) | 500 | P0 |
| Charts | SingleValue/Map | 370 | P1 |
| Components | shadcn setup | 100 | P0 |
| Components | Custom components | 300 | P1 |
| Lib | Utils & helpers | 200 | P0 |
| Editors | Cypher editor (Monaco) | 150 | P0 |
| **Main App Subtotal** | | **~5460** |
| **TOTAL** | | **~6690** |

### Notes
- Connection module is mature, tested, and ready to use
- Main app builds on top of connection module's stable API
- LOC estimates are conservative; actual may vary based on feature scope
