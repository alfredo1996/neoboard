# Task 7: Dashboard Export/Import via JSON

> **Source**: NOTES.md item #8
> **Priority**: High — enables dashboard portability and NeoDash migration
> **Dependencies**: Dashboard Pages (TASK_06C) should ideally be done first

---

## Problem Statement

Users cannot:
- Export a dashboard as a JSON file for backup or sharing
- Import a dashboard from a JSON file
- Migrate dashboards from NeoDash

The challenge is that dashboards reference `connectionId` values that are UUIDs specific to a particular NeoBoard instance. When importing on a different instance, those connections don't exist.

---

## Export Format

```json
{
  "format": "neoboard",
  "version": 1,
  "exportedAt": "2026-02-17T12:00:00Z",
  "exportedBy": "alice@example.com",
  "dashboard": {
    "name": "Movie Analytics",
    "description": "Explore the movies dataset",
    "isPublic": true,
    "layoutJson": {
      "version": 2,
      "pages": [
        {
          "id": "page-1",
          "title": "Overview",
          "widgets": [
            {
              "id": "w1",
              "chartType": "bar",
              "connectionRef": "movies-neo4j",
              "query": "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) ...",
              "settings": { "title": "Top 10 Movies" }
            }
          ],
          "gridLayout": [{ "i": "w1", "x": 0, "y": 0, "w": 6, "h": 4 }]
        }
      ]
    }
  },
  "connections": [
    {
      "ref": "movies-neo4j",
      "name": "Movies Graph (Neo4j)",
      "type": "neo4j"
    },
    {
      "ref": "movies-pg",
      "name": "Movies DB (PostgreSQL)",
      "type": "postgresql"
    }
  ]
}
```

Key design decisions:
- Widgets use `connectionRef` (a human-readable alias) instead of `connectionId` (a UUID)
- The `connections` array lists required connections with their type but **no credentials**
- The export is self-contained and portable

---

## Import Flow — Three Strategies

### Strategy 1: Use Exact Same Connections (Match by ID)

For same-instance re-imports:
- If the user's connections include matching IDs, link directly
- Fastest path, no user intervention needed

### Strategy 2: Match by Connection Type

For cross-instance imports:
- Show a mapping modal: "This dashboard needs a Neo4j connection and a PostgreSQL connection"
- User picks from their existing connections
- System rewrites `connectionRef` → `connectionId`

### Strategy 3: Manual Assignment

If no connections match:
- Import the dashboard with connections unlinked
- Widgets show "Connection missing" state
- User can edit each widget to assign a connection

### Recommended: Strategy 2 with fallback to Strategy 3

---

## Import UI: Connection Mapping Modal

```
┌──────────────────────────────────────────────────────────┐
│  Import Dashboard                                         │
│                                                           │
│  "Movie Analytics" requires 2 connections:                │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Required Connection    │ Your Connection              ││
│  ├───────────────────────┼──────────────────────────────┤│
│  │ movies-neo4j (Neo4j)  │ [Select connection ▾]       ││
│  │ movies-pg (PostgreSQL)│ [Select connection ▾]       ││
│  └───────────────────────┴──────────────────────────────┘│
│                                                           │
│  ⚠ If you don't have matching connections, you can       │
│    assign them later in the widget editor.                │
│                                                           │
│  [Cancel]  [Skip Mapping]  [Import]                      │
└──────────────────────────────────────────────────────────┘
```

The dropdowns filter to show only connections of the matching type (Neo4j connections for Neo4j refs, PostgreSQL for PostgreSQL refs).

---

## Implementation

### 1. Export API

```typescript
// app/src/app/api/dashboards/[id]/export/route.ts
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  const dashboard = await getDashboard(params.id, userId);

  // Build connection ref map
  const connectionIds = new Set<string>();
  for (const page of dashboard.layoutJson.pages ?? []) {
    for (const widget of page.widgets) {
      connectionIds.add(widget.connectionId);
    }
  }

  // Fetch connection metadata (no credentials)
  const conns = await db.select({ id, name, type })
    .from(connections)
    .where(inArray(connections.id, [...connectionIds]));

  // Build ref map: connectionId → human-readable ref
  const refMap = new Map<string, string>();
  for (const c of conns) {
    const ref = slugify(c.name); // e.g., "movies-graph-neo4j"
    refMap.set(c.id, ref);
  }

  // Replace connectionId with connectionRef in widgets
  const exportLayout = deepClone(dashboard.layoutJson);
  for (const page of exportLayout.pages ?? []) {
    for (const widget of page.widgets) {
      widget.connectionRef = refMap.get(widget.connectionId);
      delete widget.connectionId;
    }
  }

  // Build export JSON
  const exportData = {
    format: "neoboard",
    version: 1,
    exportedAt: new Date().toISOString(),
    dashboard: {
      name: dashboard.name,
      description: dashboard.description,
      isPublic: dashboard.isPublic,
      layoutJson: exportLayout,
    },
    connections: conns.map(c => ({
      ref: refMap.get(c.id),
      name: c.name,
      type: c.type,
    })),
  };

  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${slugify(dashboard.name)}.json"`,
    },
  });
}
```

### 2. Import API

```typescript
// app/src/app/api/dashboards/import/route.ts
export async function POST(request: Request) {
  const userId = await requireUserId();
  const body = await request.json();

  // Validate format
  if (body.format !== 'neoboard') throw new Error('Invalid format');

  const { dashboard, connections: requiredConns } = body;
  const connectionMapping = body.connectionMapping as Record<string, string> | undefined;

  // Remap connectionRef → connectionId using the mapping
  const layout = dashboard.layoutJson;
  for (const page of layout.pages ?? []) {
    for (const widget of page.widgets) {
      if (widget.connectionRef && connectionMapping?.[widget.connectionRef]) {
        widget.connectionId = connectionMapping[widget.connectionRef];
      }
      delete widget.connectionRef;
    }
  }

  // Create the dashboard
  const [created] = await db.insert(dashboards).values({
    userId,
    name: dashboard.name,
    description: dashboard.description,
    layoutJson: layout,
  }).returning();

  return NextResponse.json(created, { status: 201 });
}
```

### 3. Export UI (in Dashboard Viewer/Editor)

Add "Export" to the toolbar dropdown or actions:

```tsx
// In dashboard viewer toolbar:
<Button variant="outline" size="sm" onClick={handleExport}>
  <Download className="mr-2 h-4 w-4" />
  Export
</Button>
```

```typescript
async function handleExport() {
  const res = await fetch(`/api/dashboards/${id}/export`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${dashboard.name}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

### 4. Import UI (in Dashboard List)

Add "Import" button next to "New Dashboard":

```tsx
<Button variant="outline" onClick={() => fileInputRef.current?.click()}>
  <Upload className="mr-2 h-4 w-4" />
  Import
</Button>
<input
  ref={fileInputRef}
  type="file"
  accept=".json"
  hidden
  onChange={handleFileSelect}
/>
```

When a file is selected:
1. Parse the JSON
2. Show the connection mapping modal
3. On confirm, POST to `/api/dashboards/import`

### 5. NeoDash Import Converter

Add support for NeoDash format detection and conversion:

```typescript
function detectAndConvert(json: unknown): NeoboardExport {
  if (isNeoboardFormat(json)) return json;
  if (isNeoDashFormat(json)) return convertNeoDash(json);
  throw new Error('Unrecognized dashboard format');
}

function isNeoDashFormat(json: unknown): boolean {
  return json?.version?.startsWith('2.') && Array.isArray(json?.pages);
}

function convertNeoDash(neodash: NeoDashDashboard): NeoboardExport {
  // Map pages, reports → widgets, type → chartType
  // See TASK_03 for the type mapping table
}
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `app/src/app/api/dashboards/[id]/export/route.ts` | Create | Export endpoint |
| `app/src/app/api/dashboards/import/route.ts` | Create | Import endpoint |
| `app/src/components/import-dashboard-modal.tsx` | Create | Connection mapping modal |
| `app/src/app/(dashboard)/page.tsx` | Modify | Add Import button |
| `app/src/app/(dashboard)/[id]/page.tsx` | Modify | Add Export button to toolbar |
| `app/src/lib/dashboard-converter.ts` | Create | NeoDash → NeoBoard format converter |
| `app/src/lib/export-types.ts` | Create | Export format type definitions |

---

## Acceptance Criteria

- [ ] Export button downloads a `.json` file
- [ ] Exported JSON is human-readable (pretty-printed)
- [ ] Exported JSON contains no credentials or UUIDs
- [ ] Import parses the JSON and shows connection mapping modal
- [ ] Connection mapping shows only compatible connections (type match)
- [ ] Import with mapped connections creates a working dashboard
- [ ] Import with "Skip Mapping" creates dashboard with unmapped widgets
- [ ] NeoDash format JSON is auto-detected and converted on import
- [ ] Error handling for invalid/corrupt JSON files
