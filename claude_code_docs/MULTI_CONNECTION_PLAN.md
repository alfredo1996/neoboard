# Multi-Connection & PostgreSQL Implementation Plan

> Plan for adding PostgreSQL adapter and multi-connection support
> Scope: Connection module enhancements + Context refactoring
> Effort: ~24-30 hours

---

## Overview

Currently, the connection module and context support only:
- ✅ Single active connection at a time
- ✅ Neo4j only

You want:
- ❌ Multiple concurrent connections (different DBs, same DB different instances)
- ❌ PostgreSQL support

This document outlines how to achieve both **without breaking changes** to existing Neo4j code.

---

## Part 1: PostgreSQL Adapter (8-12 hours)

### 1.1 Add PostgreSQL Support to Connection Module

#### Step 1: Create PostgreSQL Module Structure
```
connection/src/postgresql/
├── PostgresConnectionModule.ts      # Main connection handler
├── PostgresAuthenticationModule.ts  # Auth (native only, no SSO)
├── PostgresRecordParser.ts          # SQL result → NeodashRecord
├── utils.ts                         # Helpers (type conversion, etc)
└── index.ts                         # Exports
```

#### Step 2: Implement PostgresAuthenticationModule
```typescript
// connection/src/postgresql/PostgresAuthenticationModule.ts

import { AuthenticationModule } from '../generalized/AuthenticationModule'
import { AuthConfig } from '../generalized/interfaces'
import { Pool } from 'pg'

export class PostgresAuthenticationModule extends AuthenticationModule {
  private pool: Pool | null = null
  private config: AuthConfig

  constructor(config: AuthConfig) {
    super()
    this.config = config
  }

  async authenticate(): Promise<boolean> {
    try {
      // Parse URI: postgresql://user:password@host:port/database
      const url = new URL(this.config.uri)
      const database = url.pathname.slice(1) || 'postgres'

      this.pool = new Pool({
        user: this.config.username,
        password: this.config.password,
        host: url.hostname,
        port: parseInt(url.port || '5432'),
        database: database,
        // Connection timeout
        connectionTimeoutMillis: 10000,
      })

      // Test connection
      const client = await this.pool.connect()
      await client.query('SELECT NOW()')
      client.release()

      return true
    } catch (error) {
      console.error('PostgreSQL auth failed:', error)
      return false
    }
  }

  getPool(): Pool | null {
    return this.pool
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
      this.pool = null
    }
  }
}
```

#### Step 3: Implement PostgresConnectionModule
```typescript
// connection/src/postgresql/PostgresConnectionModule.ts

import { ConnectionModule } from '../generalized/ConnectionModule'
import { PostgresAuthenticationModule } from './PostgresAuthenticationModule'
import { AuthConfig, ConnectionConfig, QueryCallback, QueryParams, QueryStatus } from '../generalized/interfaces'
import { PostgresRecordParser } from './PostgresRecordParser'

export class PostgresConnectionModule extends ConnectionModule {
  authModule: PostgresAuthenticationModule
  private parser: PostgresRecordParser

  constructor(config: AuthConfig) {
    super()
    this.authModule = new PostgresAuthenticationModule(config)
    this.parser = new PostgresRecordParser()
  }

  async runQuery<T>(
    queryParams: QueryParams,
    callbacks: QueryCallback<T>,
    config: ConnectionConfig
  ): Promise<void> {
    const { query, params = {} } = queryParams

    if (callbacks.setStatus) {
      if (!query || query.trim() === '') {
        callbacks.setStatus(QueryStatus.NO_QUERY)
        return
      }
      callbacks.setStatus(QueryStatus.RUNNING)
    }

    try {
      const pool = this.authModule.getPool()
      if (!pool) {
        throw new Error('Database not connected')
      }

      const client = await pool.connect()
      try {
        // Set statement timeout
        if (config.timeout) {
          await client.query(`SET statement_timeout = ${config.timeout}`)
        }

        // Execute query with parameters
        const result = await client.query(query, Object.values(params))

        // Handle result
        const rowCount = result.rowCount || 0
        const isTruncated = rowCount > config.rowLimit

        let status = QueryStatus.COMPLETE
        if (rowCount === 0) status = QueryStatus.NO_DATA
        if (isTruncated) status = QueryStatus.COMPLETE_TRUNCATED

        callbacks.setStatus?.(status)

        // Parse to NeodashRecord
        const limitedRows = isTruncated ? result.rows.slice(0, config.rowLimit) : result.rows
        const parsedResult = config.parseToNeodashRecord
          ? this.parser.parse(result.fields, limitedRows, rowCount)
          : limitedRows

        callbacks.onSuccess?.(parsedResult as T)
      } finally {
        client.release()
      }
    } catch (error) {
      callbacks.setStatus?.(QueryStatus.ERROR)
      callbacks.onFail?.(error)
    }
  }

  async checkConnection(connectionConfig: ConnectionConfig): Promise<boolean> {
    try {
      const pool = this.authModule.getPool()
      if (!pool) return false

      const client = await pool.connect()
      try {
        await client.query('SELECT 1')
        return true
      } finally {
        client.release()
      }
    } catch {
      return false
    }
  }
}
```

#### Step 4: Implement PostgresRecordParser
```typescript
// connection/src/postgresql/PostgresRecordParser.ts

import { NeodashRecordParser } from '../generalized/NeodashRecordParser'

export class PostgresRecordParser extends NeodashRecordParser {
  parse(fields: any[], rows: any[], totalCount: number): any {
    // Convert PostgreSQL result to NeodashRecord format
    return {
      fields: fields.map(field => ({
        name: field.name,
        type: this.pgTypeToColumnType(field.dataTypeID),
      })),
      records: rows,
      summary: {
        rowCount: totalCount,
        executionTime: 0, // PostgreSQL doesn't expose this easily
        queryType: 'read',
        database: 'postgres',
      },
    }
  }

  private pgTypeToColumnType(typeId: number): string {
    // Map PostgreSQL type OIDs to generic types
    const typeMap: Record<number, string> = {
      23: 'number',      // int4
      25: 'string',      // text
      16: 'boolean',     // bool
      1114: 'date',      // timestamp
      1184: 'date',      // timestamptz
      // Add more as needed
    }
    return typeMap[typeId] || 'string'
  }
}
```

#### Step 5: Update ConnectionModuleConfig
```typescript
// connection/src/ConnectionModuleConfig.ts

export enum ConnectionTypes {
  NEO4J = 'neo4j',
  POSTGRESQL = 'postgresql',
  MYSQL = 'mysql',        // Future
  REST = 'rest',          // Future
}
```

#### Step 6: Create Adapter Factory
```typescript
// connection/src/adapters/factory.ts

import { Neo4jConnectionModule } from '../neo4j/Neo4jConnectionModule'
import { PostgresConnectionModule } from '../postgresql/PostgresConnectionModule'
import { ConnectionTypes } from '../ConnectionModuleConfig'
import { AuthConfig } from '../generalized/interfaces'
import { ConnectionModule } from '../generalized/ConnectionModule'

export function createConnectionModule(
  type: ConnectionTypes,
  authConfig: AuthConfig
): ConnectionModule {
  switch (type) {
    case ConnectionTypes.NEO4J:
      return new Neo4jConnectionModule(authConfig)
    case ConnectionTypes.POSTGRESQL:
      return new PostgresConnectionModule(authConfig)
    case ConnectionTypes.MYSQL:
      throw new Error('MySQL adapter not yet implemented')
    case ConnectionTypes.REST:
      throw new Error('REST adapter not yet implemented')
    default:
      throw new Error(`Unknown connection type: ${type}`)
  }
}
```

#### Step 7: Add to Exports
```typescript
// connection/src/index.ts - ADD these lines

export { PostgresConnectionModule } from './postgresql/PostgresConnectionModule'
export { PostgresAuthenticationModule } from './postgresql/PostgresAuthenticationModule'
export { PostgresRecordParser } from './postgresql/PostgresRecordParser'
export { createConnectionModule } from './adapters/factory'
export { ConnectionTypes } from './ConnectionModuleConfig'
```

#### Step 8: Add Tests for PostgreSQL
```typescript
// connection/__tests__/postgresql/postgres-query.ts

import { PostgresConnectionModule } from '../../src/postgresql/PostgresConnectionModule'
import { AuthConfig, ConnectionConfig, QueryStatus } from '../../src/generalized/interfaces'
import { PostgreSQLContainer } from '@testcontainers/postgresql'

describe('PostgreSQL Query Execution', () => {
  let container: PostgreSQLContainer
  let authConfig: AuthConfig

  beforeAll(async () => {
    container = await new PostgreSQLContainer().start()
    authConfig = {
      username: container.getUsername(),
      password: container.getPassword(),
      authType: 1, // NATIVE
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    }
  })

  afterAll(async () => {
    await container.stop()
  })

  test('should execute SELECT query', async () => {
    const module = new PostgresConnectionModule(authConfig)
    await module.authModule.authenticate()

    let result: any = null
    let status: QueryStatus | null = null

    await module.runQuery(
      { query: 'SELECT 1 as num' },
      {
        onSuccess: (r) => (result = r),
        setStatus: (s) => (status = s),
      },
      { ...DEFAULT_CONNECTION_CONFIG, connectionType: ConnectionTypes.POSTGRESQL }
    )

    expect(status).toBe(QueryStatus.COMPLETE)
    expect(result.records[0].num).toBe(1)
  })
})
```

#### Step 9: Update package.json
```json
{
  "dependencies": {
    "neo4j-driver": "^5.28.1",
    "pg": "^8.11.0",  // ADD THIS
    "react": "^17.0.2"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "^10.24.2",  // ADD THIS
    // ... rest
  }
}
```

---

## Part 2: Multi-Connection Support (12-18 hours)

### Current Architecture Problem

```typescript
// CURRENT: Single connection only
export interface ConnectionContextState {
  isAuthenticated: boolean
  connectionConfig: ConnectionConfig
  updateAuthConfig: (authConfig: AuthConfig) => Promise<...>
  getConnectionModule: () => ConnectionModule | undefined
}
```

**Issue**: Only one active connection at a time. Cards can't use different databases.

### Proposed: Multi-Connection Architecture

```typescript
// NEW: Support multiple concurrent connections
export interface ConnectionContextState {
  // Active connections (by ID)
  connections: Record<string, ConnectionInstance>

  // Metadata
  activeConnectionId: string | null
  connectionStatus: Record<string, 'connected' | 'disconnected' | 'error'>

  // Actions
  addConnection: (id: string, authConfig: AuthConfig, connectionConfig: ConnectionConfig, type: ConnectionTypes) => Promise<void>
  removeConnection: (id: string) => Promise<void>
  setActiveConnection: (id: string) => void

  // Query execution - routes to correct connection
  execute: (query: string, params?: Record<string, any>, connectionId?: string) => Promise<NeodashRecord>

  // Get specific connection module
  getConnectionModule: (id?: string) => ConnectionModule | undefined
}

export interface ConnectionInstance {
  id: string
  name: string
  type: ConnectionTypes           // neo4j, postgresql, etc
  authConfig: AuthConfig
  connectionConfig: ConnectionConfig
  module: ConnectionModule
  isAuthenticated: boolean
  lastUsed?: Date
}
```

### 2.1 Update ConnectionContext
```typescript
// connection/src/generalized/uiComponents/ConnectionContext.ts

import { createContext } from 'react'
import { ConnectionModule } from '../ConnectionModule'
import { AuthConfig, ConnectionConfig, QueryStatus, ConnectionTypes } from '../interfaces'

export interface ConnectionInstance {
  id: string
  name: string
  type: ConnectionTypes
  authConfig: AuthConfig
  connectionConfig: ConnectionConfig
  module: ConnectionModule
  isAuthenticated: boolean
  lastUsed?: Date
}

export interface ConnectionContextState {
  // Multiple connections
  connections: Record<string, ConnectionInstance>
  activeConnectionId: string | null
  connectionStatus: Record<string, QueryStatus>
  connectionErrors: Record<string, string | null>

  // Connection management
  addConnection: (
    id: string,
    name: string,
    type: ConnectionTypes,
    authConfig: AuthConfig,
    connectionConfig: ConnectionConfig
  ) => Promise<boolean>

  removeConnection: (id: string) => Promise<void>
  setActiveConnection: (id: string | null) => void
  updateConnection: (id: string, updates: Partial<ConnectionInstance>) => void

  // Query execution - can specify connection or use active
  execute: (
    query: string,
    params?: Record<string, any>,
    connectionId?: string
  ) => Promise<any>

  // Get modules
  getConnectionModule: (id?: string) => ConnectionModule | undefined
  getActiveConnection: () => ConnectionInstance | undefined
  getConnection: (id: string) => ConnectionInstance | undefined
}

export const ConnectionContext = createContext<ConnectionContextState>(
  {} as ConnectionContextState
)
```

### 2.2 Implement MultiConnectionProvider
```typescript
// connection/src/generalized/uiComponents/MultiConnectionProvider.tsx

import React, { useState, useCallback, useRef } from 'react'
import { ConnectionContext, ConnectionContextState, ConnectionInstance } from './ConnectionContext'
import { AuthConfig, ConnectionConfig, QueryStatus, QueryCallback, ConnectionTypes } from '../interfaces'
import { createConnectionModule } from '../adapters/factory'

export const MultiConnectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connections, setConnections] = useState<Record<string, ConnectionInstance>>({})
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<Record<string, QueryStatus>>({})
  const [connectionErrors, setConnectionErrors] = useState<Record<string, string | null>>({})

  // Add a new connection
  const addConnection = useCallback(
    async (
      id: string,
      name: string,
      type: ConnectionTypes,
      authConfig: AuthConfig,
      connectionConfig: ConnectionConfig
    ): Promise<boolean> => {
      try {
        // Create module based on type
        const module = createConnectionModule(type, authConfig)

        // Test connection
        const isValid = await module.checkConnection(connectionConfig)
        if (!isValid) {
          setConnectionErrors(prev => ({
            ...prev,
            [id]: 'Failed to connect to database',
          }))
          return false
        }

        // Add to connections
        const instance: ConnectionInstance = {
          id,
          name,
          type,
          authConfig,
          connectionConfig,
          module,
          isAuthenticated: true,
          lastUsed: new Date(),
        }

        setConnections(prev => ({ ...prev, [id]: instance }))
        setConnectionStatus(prev => ({ ...prev, [id]: QueryStatus.COMPLETE }))
        setConnectionErrors(prev => ({ ...prev, [id]: null }))

        // Set as active if first connection
        if (!activeConnectionId) {
          setActiveConnectionId(id)
        }

        return true
      } catch (error) {
        setConnectionErrors(prev => ({
          ...prev,
          [id]: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }))
        return false
      }
    },
    [activeConnectionId]
  )

  // Remove a connection
  const removeConnection = useCallback(async (id: string) => {
    const connection = connections[id]
    if (connection?.module) {
      try {
        // Close connection if it has a close method
        if ('close' in connection.module) {
          await (connection.module as any).close()
        }
      } catch (error) {
        console.error(`Error closing connection ${id}:`, error)
      }
    }

    setConnections(prev => {
      const updated = { ...prev }
      delete updated[id]
      return updated
    })

    // Clear status/error for this connection
    setConnectionStatus(prev => {
      const updated = { ...prev }
      delete updated[id]
      return updated
    })
    setConnectionErrors(prev => {
      const updated = { ...prev }
      delete updated[id]
      return updated
    })

    // Clear active if it was this connection
    if (activeConnectionId === id) {
      const remainingIds = Object.keys(connections).filter(cid => cid !== id)
      setActiveConnectionId(remainingIds[0] || null)
    }
  }, [connections, activeConnectionId])

  // Execute query on specific connection
  const execute = useCallback(
    async (query: string, params?: Record<string, any>, connectionId?: string) => {
      const id = connectionId || activeConnectionId
      if (!id) {
        throw new Error('No active connection selected')
      }

      const connection = connections[id]
      if (!connection) {
        throw new Error(`Connection "${id}" not found`)
      }

      setConnectionStatus(prev => ({ ...prev, [id]: QueryStatus.RUNNING }))

      try {
        let result: any = null
        let error: any = null
        let status: QueryStatus = QueryStatus.RUNNING

        await connection.module.runQuery(
          { query, params },
          {
            onSuccess: (r: any) => {
              result = r
            },
            onFail: (err: any) => {
              error = err
            },
            setStatus: (s: QueryStatus) => {
              status = s
              setConnectionStatus(prev => ({ ...prev, [id]: s }))
            },
          },
          connection.connectionConfig
        )

        if (error) {
          setConnectionErrors(prev => ({
            ...prev,
            [id]: error instanceof Error ? error.message : String(error),
          }))
          throw error
        }

        setConnectionErrors(prev => ({ ...prev, [id]: null }))
        return result
      } catch (error) {
        setConnectionStatus(prev => ({ ...prev, [id]: QueryStatus.ERROR }))
        throw error
      }
    },
    [connections, activeConnectionId]
  )

  // Get connection module
  const getConnectionModule = useCallback(
    (id?: string): any => {
      const connectionId = id || activeConnectionId
      if (!connectionId) return undefined
      return connections[connectionId]?.module
    },
    [connections, activeConnectionId]
  )

  const getActiveConnection = useCallback(() => {
    if (!activeConnectionId) return undefined
    return connections[activeConnectionId]
  }, [connections, activeConnectionId])

  const getConnection = useCallback(
    (id: string) => {
      return connections[id]
    },
    [connections]
  )

  const updateConnection = useCallback((id: string, updates: Partial<ConnectionInstance>) => {
    setConnections(prev => ({
      ...prev,
      [id]: { ...prev[id], ...updates },
    }))
  }, [])

  const value: ConnectionContextState = {
    connections,
    activeConnectionId,
    connectionStatus,
    connectionErrors,
    addConnection,
    removeConnection,
    setActiveConnection,
    updateConnection,
    execute,
    getConnectionModule,
    getActiveConnection,
    getConnection,
  }

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
}
```

### 2.3 Create useConnection Hook
```typescript
// connection/src/generalized/uiComponents/useConnection.ts

import { useContext } from 'react'
import { ConnectionContext, ConnectionContextState } from './ConnectionContext'

export function useConnection(): ConnectionContextState {
  const context = useContext(ConnectionContext)
  if (!context) {
    throw new Error('useConnection must be used within ConnectionProvider')
  }
  return context
}
```

### 2.4 Usage in Main App

#### App.tsx
```typescript
// src/App.tsx

import { MultiConnectionProvider } from '../connection/generalized/uiComponents/MultiConnectionProvider'
import Dashboard from './core/Dashboard'

function App() {
  return (
    <MultiConnectionProvider>
      <Dashboard />
    </MultiConnectionProvider>
  )
}
```

#### Using Multiple Connections in Components
```typescript
// src/core/card/Card.tsx

import { useConnection } from '../connection/generalized/uiComponents/useConnection'

interface CardProps {
  cardId: string
  connectionId: string  // Specify which connection to use
  query: string
}

export function Card({ cardId, connectionId, query }: CardProps) {
  const { execute } = useConnection()

  const handleRunQuery = async () => {
    try {
      // Execute on SPECIFIC connection, not active
      const result = await execute(query, {}, connectionId)
      // Handle result...
    } catch (error) {
      // Handle error...
    }
  }

  return (
    <div>
      <h2>{cardId}</h2>
      <button onClick={handleRunQuery}>Run Query</button>
    </div>
  )
}
```

#### Managing Multiple Connections
```typescript
// src/components/ConnectionManager.tsx

import { useConnection } from '../connection/generalized/uiComponents/useConnection'
import { ConnectionTypes } from '../connection'

export function ConnectionManager() {
  const {
    connections,
    activeConnectionId,
    addConnection,
    removeConnection,
    setActiveConnection
  } = useConnection()

  const handleAddNeo4j = async () => {
    const success = await addConnection(
      'neo4j-main',
      'Neo4j Main',
      ConnectionTypes.NEO4J,
      {
        username: 'neo4j',
        password: 'password',
        authType: 1,
        uri: 'bolt://localhost:7687',
      },
      {
        connectionTimeout: 30000,
        timeout: 2000,
        database: 'neo4j',
        accessMode: 'READ',
        rowLimit: 5000,
        connectionType: ConnectionTypes.NEO4J,
        parseToNeodashRecord: true,
        useNodePropsAsFields: false,
      }
    )

    if (!success) {
      alert('Failed to connect')
    }
  }

  const handleAddPostgres = async () => {
    const success = await addConnection(
      'postgres-data',
      'PostgreSQL Data',
      ConnectionTypes.POSTGRESQL,
      {
        username: 'user',
        password: 'password',
        authType: 1,
        uri: 'postgresql://user:password@localhost:5432/mydb',
      },
      {
        connectionTimeout: 30000,
        timeout: 2000,
        connectionType: ConnectionTypes.POSTGRESQL,
        rowLimit: 5000,
        parseToNeodashRecord: true,
        useNodePropsAsFields: false,
      }
    )

    if (!success) {
      alert('Failed to connect to PostgreSQL')
    }
  }

  return (
    <div>
      <h3>Connections</h3>
      {Object.entries(connections).map(([id, conn]) => (
        <div key={id}>
          <span>{conn.name} ({conn.type})</span>
          <button
            onClick={() => setActiveConnection(id)}
            style={{ fontWeight: activeConnectionId === id ? 'bold' : 'normal' }}
          >
            Set Active
          </button>
          <button onClick={() => removeConnection(id)}>Remove</button>
        </div>
      ))}

      <button onClick={handleAddNeo4j}>+ Neo4j</button>
      <button onClick={handleAddPostgres}>+ PostgreSQL</button>
    </div>
  )
}
```

---

## Integration Checklist

### Phase 1: PostgreSQL Adapter (8-12h)
- [ ] Create `postgresql/` directory structure
- [ ] Implement `PostgresConnectionModule`
- [ ] Implement `PostgresAuthenticationModule`
- [ ] Implement `PostgresRecordParser`
- [ ] Create adapter factory (`adapters/factory.ts`)
- [ ] Add comprehensive tests with testcontainers
- [ ] Update connection module exports
- [ ] Test with real PostgreSQL instance
- [ ] Update ARCHITECTURE.md

### Phase 2: Multi-Connection Context (12-18h)
- [ ] Update `ConnectionContext` interface for multi-connection
- [ ] Implement `MultiConnectionProvider` component
- [ ] Create `useConnection` hook
- [ ] Update `ConnectionProvider` or replace with `MultiConnectionProvider`
- [ ] Create `ConnectionManager` component in main app
- [ ] Update card/query components to accept `connectionId`
- [ ] Update connection store in main app (Zustand)
- [ ] Test with multiple concurrent connections
- [ ] Update ARCHITECTURE.md
- [ ] Test with mixed Neo4j + PostgreSQL connections

### Phase 3: Main App Integration (4-6h)
- [ ] Setup app to use `MultiConnectionProvider`
- [ ] Create connection management UI
- [ ] Update card store to include `connectionId`
- [ ] Update query hooks to use specified connection
- [ ] Add connection selection to card settings
- [ ] Test dashboard with multiple connections

---

## Breaking Changes Assessment

### For Existing Code Using Old ConnectionProvider:

**Option A: Keep Backwards Compatibility**
```typescript
// Create ConnectionProvider as wrapper around MultiConnectionProvider
export const ConnectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <MultiConnectionProvider>{children}</MultiConnectionProvider>
}

// This keeps old code working without changes
```

**Option B: Force Migration**
- Update main app to use `MultiConnectionProvider`
- Update connection store to work with multiple connections
- Card components pass `connectionId` prop

**Recommendation**: Use Option A for backwards compatibility, but new code should use MultiConnectionProvider.

---

## Timeline

```
Week 1, Days 1-3: PostgreSQL Adapter (8-10h)
  - Implementation
  - Testing
  - Documentation

Week 1, Days 4-5: Multi-Connection Refactor (12-14h)
  - ConnectionContext update
  - Provider implementation
  - Testing

Week 2, Days 1-2: Main App Integration (4-6h)
  - Connect everything
  - Connection manager UI
  - End-to-end testing

Total: ~26-30 hours
```

---

## Example: Complete Flow

### Setup
```typescript
const App = () => (
  <MultiConnectionProvider>
    <div>
      <ConnectionManager />  {/* Add/manage connections */}
      <Dashboard />          {/* Displays cards */}
    </div>
  </MultiConnectionProvider>
)
```

### Adding Connections
```typescript
const { addConnection } = useConnection()

// User clicks "Add Neo4j"
await addConnection(
  'neo4j-1',
  'Production Neo4j',
  ConnectionTypes.NEO4J,
  { username: 'neo4j', password: '...', uri: 'bolt://prod-db:7687' },
  { rowLimit: 10000, ... }
)

// User clicks "Add PostgreSQL"
await addConnection(
  'postgres-1',
  'Analytics DB',
  ConnectionTypes.POSTGRESQL,
  { username: 'analyst', password: '...', uri: 'postgresql://analytics-db:5432/analytics' },
  { rowLimit: 5000, ... }
)
```

### Using in Cards
```typescript
// Card on page 1 uses Neo4j
<Card connectionId="neo4j-1" query="MATCH (n) RETURN n LIMIT 10" />

// Card on page 2 uses PostgreSQL
<Card connectionId="postgres-1" query="SELECT * FROM users LIMIT 10" />

// Both execute in parallel, on different databases!
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Connection pooling overload | Memory issues with many connections | Implement connection limits in provider |
| Query conflicts | Slow queries block others | Use async/await, don't block |
| State management | Complex connection state | Use Zustand + context together |
| Breaking changes | Old code breaks | Keep backwards-compatible wrapper |
| Type safety | TypeScript errors | Strict typing in context interface |

---

## Success Criteria

- ✅ Can create and manage 5+ concurrent connections
- ✅ Cards can use different connections simultaneously
- ✅ Neo4j and PostgreSQL both work
- ✅ No breaking changes to existing Neo4j code
- ✅ Type-safe: full TypeScript support
- ✅ Extensible: easy to add MySQL/REST adapters later
- ✅ Error handling: connection failures don't crash app
- ✅ Tests pass: unit and integration tests
