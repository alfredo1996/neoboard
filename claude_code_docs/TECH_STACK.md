# NeoBoard - Tech Stack

> Complete technical stack for the NeoBoard project.
> This document contains all libraries, versions, and installation commands.

---

## Quick Setup

```bash
# Create project
npm create vite@latest neoboard -- --template react-ts
cd neoboard

# Core dependencies
npm i react@18.3.1 react-dom@18.3.1
npm i zustand@5.0.2 @tanstack/react-query@5.62.0

# Database
npm i neo4j-driver@5.27.0 sql.js@1.11.0

# Charts
npm i echarts@5.5.1 echarts-for-react@3.0.2
npm i ag-grid-community@32.3.3 ag-grid-react@32.3.3
npm i @neo4j-nvl/react@0.5.0 @neo4j-nvl/interaction-handlers@0.5.0

# Layout & Editor
npm i react-grid-layout@1.5.0
npm i @monaco-editor/react@4.6.0

# Maps
npm i react-leaflet@4.2.1 leaflet@1.9.4

# Forms & Validation
npm i react-hook-form@7.54.1 zod@3.24.1 @hookform/resolvers@3.9.1

# UI Utilities
npm i lucide-react@0.468.0 sonner@1.7.1
npm i class-variance-authority@0.7.1 clsx@2.1.1 tailwind-merge@2.6.0
npm i uuid@11.0.3

# Dev dependencies
npm i -D typescript@5.7.2 @types/react@18.3.16 @types/react-dom@18.3.5
npm i -D @types/leaflet@1.9.14 @types/uuid@10.0.0 @types/react-grid-layout@1.3.5
npm i -D vite@6.0.5 @vitejs/plugin-react@4.3.4
npm i -D tailwindcss@3.4.17 postcss@8.4.49 autoprefixer@10.4.20
npm i -D eslint@9.17.0 @typescript-eslint/eslint-plugin@8.18.1 @typescript-eslint/parser@8.18.1

# Initialize Tailwind
npx tailwindcss init -p

# Initialize shadcn/ui
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card dialog input select tabs dropdown-menu toast skeleton
```

---

## Package.json

```json
{
  "name": "neoboard",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.2",
    "@tanstack/react-query": "^5.62.0",
    "neo4j-driver": "^5.27.0",
    "sql.js": "^1.11.0",
    "echarts": "^5.5.1",
    "echarts-for-react": "^3.0.2",
    "ag-grid-community": "^32.3.3",
    "ag-grid-react": "^32.3.3",
    "@neo4j-nvl/react": "^0.5.0",
    "@neo4j-nvl/interaction-handlers": "^0.5.0",
    "react-grid-layout": "^1.5.0",
    "@monaco-editor/react": "^4.6.0",
    "react-leaflet": "^4.2.1",
    "leaflet": "^1.9.4",
    "react-hook-form": "^7.54.1",
    "zod": "^3.24.1",
    "@hookform/resolvers": "^3.9.1",
    "lucide-react": "^0.468.0",
    "sonner": "^1.7.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "uuid": "^11.0.3"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "@types/react": "^18.3.16",
    "@types/react-dom": "^18.3.5",
    "@types/leaflet": "^1.9.14",
    "@types/uuid": "^10.0.0",
    "@types/react-grid-layout": "^1.3.5",
    "vite": "^6.0.5",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^3.4.17",
    "postcss": "^8.4.49",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.17.0",
    "@typescript-eslint/eslint-plugin": "^8.18.1",
    "@typescript-eslint/parser": "^8.18.1"
  }
}
```

---

## Library Reference

### Framework & Build

| Library | Version | Purpose | Import |
|---------|---------|---------|--------|
| React | 18.3.1 | UI framework | `import React from 'react'` |
| TypeScript | 5.7.2 | Type safety | - |
| Vite | 6.0.5 | Build tool | - |

### State Management

| Library | Version | Purpose | Import |
|---------|---------|---------|--------|
| Zustand | 5.0.2 | Global state | `import { create } from 'zustand'` |
| TanStack Query | 5.62.0 | Server state | `import { useQuery } from '@tanstack/react-query'` |

**Zustand Example:**
```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ConnectionState {
  connections: ConnectionConfig[]
  addConnection: (config: ConnectionConfig) => void
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      connections: [],
      addConnection: (config) => 
        set((state) => ({ connections: [...state.connections, config] })),
    }),
    { name: 'neoboard-connections' }
  )
)
```

**TanStack Query Example:**
```typescript
import { useQuery } from '@tanstack/react-query'

export function useCypher(query: string, params?: Record<string, any>) {
  const { execute } = useConnection()
  
  return useQuery({
    queryKey: ['cypher', query, params],
    queryFn: () => execute(query, params),
    enabled: !!query,
  })
}
```

### Styling

| Library | Version | Purpose | Import |
|---------|---------|---------|--------|
| Tailwind CSS | 3.4.17 | Utility CSS | `className="flex items-center"` |
| shadcn/ui | - | Components | `import { Button } from '@/components/ui/button'` |
| Lucide React | 0.468.0 | Icons | `import { Settings, Plus } from 'lucide-react'` |
| clsx | 2.1.1 | Class names | `import { clsx } from 'clsx'` |
| tailwind-merge | 2.6.0 | Merge classes | `import { twMerge } from 'tailwind-merge'` |
| CVA | 0.7.1 | Variants | `import { cva } from 'class-variance-authority'` |

**Utils Setup (src/lib/utils.ts):**
```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### Charts

| Library | Version | Purpose | Bundle Size |
|---------|---------|---------|-------------|
| Apache ECharts | 5.5.1 | Bar/Line/Pie | ~1MB |
| echarts-for-react | 3.0.2 | React wrapper | ~5kb |
| AG Grid Community | 32.3.3 | Data tables | ~500kb |
| @neo4j-nvl/react | 0.5.0 | Graph viz | ~200kb |

**ECharts Example:**
```typescript
import ReactECharts from 'echarts-for-react'

export function BarChart({ data }: { data: InternalResult }) {
  const option = {
    xAxis: { type: 'category', data: data.rows.map(r => r.category) },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: data.rows.map(r => r.value) }]
  }
  
  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
}
```

**AG Grid Example:**
```typescript
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

export function TableChart({ data }: { data: InternalResult }) {
  const columnDefs = data.columns.map(col => ({
    field: col.name,
    headerName: col.name,
    sortable: true,
    filter: true,
  }))
  
  return (
    <div className="ag-theme-alpine" style={{ height: '100%', width: '100%' }}>
      <AgGridReact rowData={data.rows} columnDefs={columnDefs} />
    </div>
  )
}
```

**Neo4j NVL Example:**
```typescript
import { InteractiveNvlWrapper } from '@neo4j-nvl/react'

export function GraphChart({ data }: { data: InternalResult }) {
  const nodes = data.graph?.nodes.map(n => ({
    id: n.id,
    caption: n.properties.name || n.labels[0],
  })) || []
  
  const relationships = data.graph?.relationships.map(r => ({
    id: r.id,
    from: r.startNodeId,
    to: r.endNodeId,
    caption: r.type,
  })) || []
  
  return (
    <InteractiveNvlWrapper
      nodes={nodes}
      relationships={relationships}
      nvlOptions={{ layout: 'force' }}
    />
  )
}
```

### Layout

| Library | Version | Purpose | Import |
|---------|---------|---------|--------|
| react-grid-layout | 1.5.0 | Dashboard grid | `import GridLayout from 'react-grid-layout'` |

**Grid Layout Example:**
```typescript
import GridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

export function DashboardGrid({ cards, layout, onLayoutChange }) {
  return (
    <GridLayout
      className="layout"
      layout={layout}
      cols={12}
      rowHeight={100}
      width={1200}
      onLayoutChange={onLayoutChange}
      draggableHandle=".card-header"
    >
      {cards.map(card => (
        <div key={card.id}>
          <Card card={card} />
        </div>
      ))}
    </GridLayout>
  )
}
```

### Code Editor

| Library | Version | Purpose | Import |
|---------|---------|---------|--------|
| Monaco Editor | 4.6.0 | Query editor | `import Editor from '@monaco-editor/react'` |

**Monaco Example:**
```typescript
import Editor from '@monaco-editor/react'

export function CypherEditor({ value, onChange, onRun }) {
  return (
    <Editor
      height="200px"
      language="cypher"
      theme="vs-dark"
      value={value}
      onChange={onChange}
      options={{
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
      }}
      onMount={(editor, monaco) => {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRun)
      }}
    />
  )
}
```

### Maps

| Library | Version | Purpose | Import |
|---------|---------|---------|--------|
| react-leaflet | 4.2.1 | Map component | `import { MapContainer, TileLayer } from 'react-leaflet'` |
| leaflet | 1.9.4 | Map library | - |

**Leaflet Example:**
```typescript
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

export function MapChart({ data }: { data: InternalResult }) {
  const markers = data.rows.filter(r => r.lat && r.lng)
  
  return (
    <MapContainer center={[51.505, -0.09]} zoom={13} style={{ height: '100%', width: '100%' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {markers.map((m, i) => (
        <Marker key={i} position={[m.lat, m.lng]}>
          <Popup>{m.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
```

### Database

| Library | Version | Purpose | Import |
|---------|---------|---------|--------|
| neo4j-driver | 5.27.0 | Neo4j connection | `import neo4j from 'neo4j-driver'` |
| sql.js | 1.11.0 | Browser SQLite | `import initSqlJs from 'sql.js'` |

**Neo4j Example:**
```typescript
import neo4j, { Driver, Session } from 'neo4j-driver'

export class Neo4jDataSource implements IDataSource {
  private driver: Driver | null = null
  
  async connect(config: ConnectionConfig): Promise<void> {
    this.driver = neo4j.driver(
      `neo4j://${config.host}:${config.port}`,
      neo4j.auth.basic(config.username!, config.password!)
    )
    await this.driver.verifyConnectivity()
  }
  
  async execute(query: string, params?: Record<string, any>): Promise<InternalResult> {
    const session = this.driver!.session()
    try {
      const result = await session.run(query, params)
      return this.parseResult(result)
    } finally {
      await session.close()
    }
  }
  
  private parseResult(result: any): InternalResult {
    // Transform Neo4j result to InternalResult
    const columns = result.keys.map(key => ({ name: key, type: 'string', nullable: true }))
    const rows = result.records.map(record => {
      const row: Record<string, any> = {}
      result.keys.forEach(key => { row[key] = record.get(key) })
      return row
    })
    return { columns, rows, metadata: { executionTime: 0, rowCount: rows.length, hasMore: false, sourceType: 'neo4j' } }
  }
}
```

**sql.js Example:**
```typescript
import initSqlJs, { Database } from 'sql.js'

let db: Database | null = null

export async function initDatabase(): Promise<Database> {
  if (db) return db
  
  const SQL = await initSqlJs({
    locateFile: file => `https://sql.js.org/dist/${file}`
  })
  
  db = new SQL.Database()
  db.run(`
    CREATE TABLE IF NOT EXISTS dashboards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)
  
  return db
}
```

### Forms & Validation

| Library | Version | Purpose | Import |
|---------|---------|---------|--------|
| react-hook-form | 7.54.1 | Form state | `import { useForm } from 'react-hook-form'` |
| zod | 3.24.1 | Validation | `import { z } from 'zod'` |
| @hookform/resolvers | 3.9.1 | Zod + RHF | `import { zodResolver } from '@hookform/resolvers/zod'` |

**Form Example:**
```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const connectionSchema = z.object({
  name: z.string().min(1, 'Name required'),
  host: z.string().min(1, 'Host required'),
  port: z.coerce.number().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(),
})

type ConnectionForm = z.infer<typeof connectionSchema>

export function ConnectionForm({ onSubmit }) {
  const { register, handleSubmit, formState: { errors } } = useForm<ConnectionForm>({
    resolver: zodResolver(connectionSchema),
    defaultValues: { port: 7687 }
  })
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} placeholder="Connection name" />
      {errors.name && <span>{errors.name.message}</span>}
      {/* ... other fields */}
    </form>
  )
}
```

### Utilities

| Library | Version | Purpose | Import |
|---------|---------|---------|--------|
| uuid | 11.0.3 | Generate IDs | `import { v4 as uuidv4 } from 'uuid'` |
| sonner | 1.7.1 | Toasts | `import { toast } from 'sonner'` |

**Toast Example:**
```typescript
import { Toaster, toast } from 'sonner'

// In App.tsx
<Toaster position="bottom-right" />

// Usage
toast.success('Dashboard saved!')
toast.error('Connection failed')
toast.loading('Executing query...')
```

---

## Configuration Files

### vite.config.ts
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### tailwind.config.js
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

---

## CSS Imports Required

Add to `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* AG Grid */
@import 'ag-grid-community/styles/ag-grid.css';
@import 'ag-grid-community/styles/ag-theme-alpine.css';

/* React Grid Layout */
@import 'react-grid-layout/css/styles.css';
@import 'react-resizable/css/styles.css';

/* Leaflet */
@import 'leaflet/dist/leaflet.css';
```

---

## Bundle Size Summary

| Category | Libraries | Est. Size (gzip) |
|----------|-----------|------------------|
| Framework | React, ReactDOM | ~45kb |
| State | Zustand, TanStack Query | ~45kb |
| Charts | ECharts | ~300kb |
| Table | AG Grid | ~150kb |
| Graph | Neo4j NVL | ~80kb |
| Editor | Monaco (lazy) | ~800kb |
| Maps | Leaflet (lazy) | ~40kb |
| Other | Utilities | ~30kb |
| **Total** | | **~700kb** (excl. Monaco) |

> Monaco Editor should be lazy-loaded as it adds ~800kb to the bundle.
