# Task 2: Connection-Specific Code Editors & Schema Fetching

> **Source**: NOTES.md item #2
> **Priority**: High — significantly improves query authoring UX
> **Dependencies**: None (can be done in parallel with other tasks)

---

## Problem Statement

The widget editor currently uses a plain `<Textarea>` for query input. There is:
- No syntax highlighting (Cypher vs SQL look identical)
- No autocompletion
- No schema awareness (users must remember table/column/label/property names)
- No way to explore the connected database's schema

## Current State

In `widget-editor-modal.tsx:202-210`:
```tsx
<Textarea
  id="editor-query"
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  placeholder="MATCH (n) RETURN n.name AS name, n.born AS value LIMIT 10"
  className="font-mono min-h-[100px]"
  rows={4}
/>
```

The component library already exports a `QueryEditor` composed component — check its capabilities.

---

## Proposed Solution

### 1. Code Editor Component

**Option A: CodeMirror 6** (Recommended)
- `@codemirror/lang-sql` — SQL syntax highlighting and basic completion
- `@codemirror/lang-cypher` doesn't exist officially, but community packages exist (`codemirror-lang-cypher` or `@neo4j-cypher/codemirror`)
- Lightweight, tree-shakeable, works in React
- Already a standard in the industry (used by Neo4j Browser, DBeaver web)

**Option B: Monaco Editor** (VS Code engine)
- Heavier (~2MB), but supports any language
- `monaco-cypher` package exists
- Better for power users, overkill for a dashboard builder

**Recommendation**: CodeMirror 6 — lighter, faster loading, adequate for query editing.

### 2. Implementation in Component Library

Create a new composed component or enhance the existing `QueryEditor`:

```tsx
// component/src/components/composed/query-editor.tsx
export interface QueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: 'cypher' | 'sql';
  /** Schema for autocompletion */
  schema?: DatabaseSchema;
  /** Height */
  height?: string;
  placeholder?: string;
  readOnly?: boolean;
}
```

The editor should:
- Auto-detect language from connection type (`neo4j` → Cypher, `postgresql` → SQL)
- Apply appropriate syntax highlighting theme
- Provide basic autocompletion from the schema

### 3. Schema Fetching

#### Neo4j Schema
Neo4j provides built-in procedures for schema introspection:

```cypher
-- Get all node labels
CALL db.labels() YIELD label RETURN label

-- Get all relationship types
CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType

-- Get all property keys
CALL db.propertyKeys() YIELD propertyKey RETURN propertyKey

-- Get schema visualization (nodes with their properties)
CALL db.schema.nodeTypeProperties() YIELD nodeType, propertyName, propertyTypes
RETURN nodeType, propertyName, propertyTypes

-- Get relationship schema
CALL db.schema.relTypeProperties() YIELD relType, propertyName, propertyTypes
RETURN relType, propertyName, propertyTypes

-- Full visual schema (Neo4j 5+)
CALL db.schema.visualization()
```

#### PostgreSQL Schema
PostgreSQL uses `information_schema`:

```sql
-- Get all tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- Get columns for a table
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- Get all tables with their columns in one query
SELECT t.table_name, c.column_name, c.data_type
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;
```

### 4. Schema API Endpoint

Create a new API route:

```typescript
// app/src/app/api/connections/[id]/schema/route.ts
export async function GET(request: Request, { params }: { params: { id: string } }) {
  // 1. Verify user owns connection
  // 2. Decrypt connection credentials
  // 3. Execute schema query based on connection type
  // 4. Return normalized schema format
}
```

### 5. Normalized Schema Type

```typescript
// app/src/lib/schema-types.ts (or in connection module)
export interface DatabaseSchema {
  type: 'neo4j' | 'postgresql';

  // For Neo4j
  labels?: string[];
  relationshipTypes?: string[];
  nodeProperties?: Record<string, PropertyDef[]>;    // label → properties
  relProperties?: Record<string, PropertyDef[]>;      // type → properties

  // For PostgreSQL
  tables?: TableDef[];
}

export interface PropertyDef {
  name: string;
  type: string;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
}

export interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
}
```

### 6. Schema Hook

```typescript
// app/src/hooks/use-schema.ts
export function useConnectionSchema(connectionId: string | null) {
  return useQuery<DatabaseSchema>({
    queryKey: ['connection-schema', connectionId],
    queryFn: async () => {
      const res = await fetch(`/api/connections/${connectionId}/schema`);
      if (!res.ok) throw new Error('Failed to fetch schema');
      return res.json();
    },
    enabled: !!connectionId,
    staleTime: 10 * 60 * 1000, // 10 min — schema doesn't change often
  });
}
```

### 7. Schema Panel UI

Add a collapsible schema browser panel next to the query editor:

```
┌─────────────────────────────────────────────────────────┐
│  Widget Editor                                          │
├──────────────────────┬──────────────────────────────────┤
│  Schema Browser      │  Query Editor                    │
│  ▸ Person            │  ┌──────────────────────────┐   │
│    • name (String)   │  │ MATCH (p:Person)         │   │
│    • born (Integer)  │  │ WHERE p.name = $param    │   │
│  ▸ Movie             │  │ RETURN p.name, p.born    │   │
│    • title (String)  │  │ LIMIT 10                 │   │
│    • released (Int)  │  └──────────────────────────┘   │
│  ▸ ACTED_IN          │  [Run Query]                     │
│    • roles (List)    │                                  │
│  ▸ DIRECTED          │  Preview:                        │
│                      │  ┌──────────────────────────┐   │
│                      │  │  [Chart Preview]          │   │
│                      │  └──────────────────────────┘   │
├──────────────────────┴──────────────────────────────────┤
│  Chart Options                                          │
└─────────────────────────────────────────────────────────┘
```

Clicking a label/table/column in the schema browser inserts it into the query at the cursor position.

---

## Connection Module Changes

The `connection/` module currently has `runQuery` and `checkConnection` methods. We need to add a `getSchema` method:

```typescript
// connection/src/generalized/ConnectionModule.ts
export abstract class ConnectionModule {
  abstract runQuery<T>(...): Promise<void>;
  abstract checkConnection(...): Promise<boolean>;
  abstract getSchema(config: ConnectionConfig): Promise<DatabaseSchema>; // NEW
}
```

Or, simpler: just use the existing `runQuery` with the schema introspection queries from the API route — no module change needed.

---

## Implementation Order

1. **Phase 1**: Schema API endpoint (uses existing `runQuery` with introspection queries)
2. **Phase 2**: `useConnectionSchema` hook
3. **Phase 3**: Replace `<Textarea>` with CodeMirror editor in `WidgetEditorModal`
4. **Phase 4**: Schema browser panel with click-to-insert
5. **Phase 5**: Autocompletion from schema in CodeMirror

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `app/src/app/api/connections/[id]/schema/route.ts` | Create | Schema introspection endpoint |
| `app/src/hooks/use-schema.ts` | Create | React Query hook for schema |
| `app/src/components/widget-editor-modal.tsx` | Modify | Replace Textarea with code editor + schema panel |
| `component/src/components/composed/query-editor.tsx` | Modify/Enhance | Add CodeMirror, language prop, schema-aware completion |
| `component/package.json` | Modify | Add `@codemirror/*` dependencies |
| `app/src/lib/schema-types.ts` | Create | Shared schema type definitions |

---

## Package Dependencies to Add

In `component/package.json`:
```json
{
  "codemirror": "^6.x",
  "@codemirror/lang-sql": "^6.x",
  "@codemirror/theme-one-dark": "^6.x",
  "@codemirror/autocomplete": "^6.x",
  "codemirror-lang-cypher": "^1.x"  // or @neo4j-cypher/codemirror
}
```

---

## Acceptance Criteria

- [ ] Cypher queries have syntax highlighting in the editor
- [ ] SQL queries have syntax highlighting in the editor
- [ ] Language auto-detected from the selected connection type
- [ ] Schema browser shows labels/relationships (Neo4j) or tables/columns (PostgreSQL)
- [ ] Clicking a schema item inserts it at cursor position
- [ ] Basic autocompletion suggests schema items while typing
- [ ] Schema is cached (10min staleTime) and refreshable
- [ ] Editor preserves undo/redo history during the session
