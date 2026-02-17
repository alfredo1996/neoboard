# Task 6: Dashboard UX Improvements — Selection Options, Metadata, Pages

> **Source**: NOTES.md items #6, #7, #10
> **Priority**: High — these are core UX gaps
> **Dependencies**: None

---

## Sub-tasks

### 6A. Dashboard Card Options (NOTES #6)
### 6B. Dashboard Metadata (NOTES #7)
### 6C. Dashboard Pages/Tabs (NOTES #10)

---

## 6A. Dashboard Card Options

### Problem

The dashboard list page shows each dashboard as a `Card` with "Edit" and "Delete" buttons. But:
- The buttons are flat text inside `CardContent`, not in a consistent action menu
- The widget cards (in edit mode) use a dropdown menu with `WidgetCard.actions` — the dashboard cards should match this pattern

### Current State (`app/src/app/(dashboard)/page.tsx:134-176`)

Each card shows an "Edit" button and a "Delete" button as `<Button variant="ghost">` inside `CardContent`. This feels disconnected.

### Proposed Fix

Replace the flat buttons with a **three-dot dropdown menu** (consistent with widget cards):

```tsx
<Card key={d.id}>
  <CardHeader className="pb-2">
    <div className="flex items-start justify-between">
      <CardTitle className="text-base">{d.name}</CardTitle>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/${d.id}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/${d.id}`)}>
            <Eye className="mr-2 h-4 w-4" /> View
          </DropdownMenuItem>
          {d.role === "owner" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDeleteTarget(d.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </CardHeader>
</Card>
```

### Files to Modify
- `app/src/app/(dashboard)/page.tsx` — replace flat buttons with dropdown menu

---

## 6B. Dashboard Metadata

### Problem

There is no way to see dashboard metadata (when it was last updated, who updated it, who owns it). The data model also doesn't store some useful properties.

### Current Data Model

From `app/src/lib/db/schema.ts:97-113`:
```typescript
dashboards = pgTable("dashboard", {
  id, userId, name, description, layoutJson,
  isPublic, createdAt, updatedAt
});
```

Missing:
- `updatedBy` — who last updated the dashboard
- No way to see metadata in the UI

### Proposed Data Model Changes

```typescript
// Add to dashboards table:
updatedBy: text("updatedBy").references(() => users.id),
```

Optional additional metadata (stored in a new `metadata` JSONB column or separate fields):
- `version: number` — auto-incremented on each save
- `thumbnail: text` — base64 thumbnail for the dashboard card (future)
- `tags: text[]` — categorization tags (future)

Minimal change: just add `updatedBy` column.

### Schema Migration

```sql
ALTER TABLE "dashboard" ADD COLUMN "updatedBy" text REFERENCES "user"("id");
```

Also update `docker/postgres/init.sql` to include the new column.

### API Changes

The `PUT /api/dashboards/[id]` route should set `updatedBy` to the current user's ID:

```typescript
// In app/src/app/api/dashboards/[id]/route.ts PUT handler:
await db.update(dashboards)
  .set({
    ...data,
    updatedAt: new Date(),
    updatedBy: userId,  // NEW
  })
  .where(and(eq(dashboards.id, id), eq(dashboards.userId, userId)));
```

### Metadata Display UI

Add a metadata section to the dashboard viewer page. Two options:

**Option A: Subtle metadata bar** (recommended)
Below the toolbar, show a small gray text line:
```
Last updated: Feb 15, 2026 by Alice Demo • Created: Feb 10, 2026 • Owner: Alice Demo
```

**Option B: Info dialog**
Add an "Info" button (ℹ️) in the toolbar that opens a dialog with:
- Owner name & email
- Created date
- Last updated date & who updated
- Number of widgets
- Connection dependencies

### Dashboard List Enhancement

In the dashboard card, show metadata under the title:
```
Movie Analytics
Explore the movies dataset...
Updated 2 hours ago • 4 widgets
```

Use the `TimeAgo` composed component already available in the library.

### Files to Modify
- `app/src/lib/db/schema.ts` — add `updatedBy` field
- `docker/postgres/init.sql` — add column
- `app/src/app/api/dashboards/[id]/route.ts` — set `updatedBy` on save
- `app/src/app/api/dashboards/route.ts` — join with users to return owner name
- `app/src/app/(dashboard)/page.tsx` — show metadata on cards
- `app/src/app/(dashboard)/[id]/page.tsx` — show metadata bar

---

## 6C. Dashboard Pages/Tabs

### Problem

A dashboard currently has a flat list of widgets. NeoDash supports multiple **pages** within a dashboard (tabs at the top). This is essential for organizing complex dashboards.

### Current Data Model

```typescript
interface DashboardLayout {
  widgets: DashboardWidget[];
  gridLayout: GridLayoutItem[];
}
```

### Proposed Data Model

```typescript
interface DashboardLayout {
  /** Version for migration — existing dashboards without pages are v1 */
  version?: 2;
  /** Dashboard-level settings */
  settings?: DashboardSettings;
  /** Pages (tabs) */
  pages: DashboardPage[];
}

interface DashboardPage {
  id: string;
  title: string;
  widgets: DashboardWidget[];
  gridLayout: GridLayoutItem[];
}

// Backward-compatible: if `pages` is absent, treat the root widgets/gridLayout as page 0
```

### Migration

Old format (v1):
```json
{ "widgets": [...], "gridLayout": [...] }
```

New format (v2):
```json
{
  "version": 2,
  "pages": [
    { "id": "page-1", "title": "Overview", "widgets": [...], "gridLayout": [...] },
    { "id": "page-2", "title": "Details", "widgets": [...], "gridLayout": [...] }
  ]
}
```

**Migration function**:
```typescript
function migrateLayout(layout: unknown): DashboardLayoutV2 {
  const raw = layout as Record<string, unknown>;
  if (raw.version === 2 && Array.isArray(raw.pages)) return raw as DashboardLayoutV2;
  // v1 → v2: wrap existing widgets in a single page
  const v1 = raw as DashboardLayoutV1;
  return {
    version: 2,
    pages: [{
      id: 'page-1',
      title: 'Page 1',
      widgets: v1.widgets ?? [],
      gridLayout: v1.gridLayout ?? [],
    }],
  };
}
```

### UI Implementation

Add a **tab bar** between the toolbar and the dashboard grid:

```
┌──────────────────────────────────────────────────────────────┐
│ [← Back]     Movie Analytics     [owner]           [Edit]    │  ← Toolbar
├──────────────────────────────────────────────────────────────┤
│  [Overview]  [Actor Network]  [Revenue]  [+]                 │  ← Page Tabs
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │  ← Grid
│  │ Widget 1 │  │ Widget 2 │  │ Widget 3 │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└──────────────────────────────────────────────────────────────┘
```

In edit mode:
- [+] button adds a new page
- Right-click / long-press on a tab shows rename/delete options
- Pages can be reordered by dragging tabs (future enhancement)

### Zustand Store Changes

Update `dashboard-store.ts`:
```typescript
interface DashboardState {
  layout: DashboardLayoutV2;
  activePageIndex: number;
  // ... existing methods
  setActivePage: (index: number) => void;
  addPage: (title: string) => void;
  removePage: (pageId: string) => void;
  renamePage: (pageId: string, title: string) => void;
  // Widget methods now operate on the active page
  addWidget: (widget, gridItem) => void;
  removeWidget: (widgetId) => void;
  // etc.
}
```

### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `app/src/lib/db/schema.ts` | Modify | Update DashboardLayout type, add DashboardPage |
| `app/src/stores/dashboard-store.ts` | Modify | Add page management, active page index |
| `app/src/components/dashboard-container.tsx` | Modify | Render active page's widgets only |
| `app/src/app/(dashboard)/[id]/page.tsx` | Modify | Add tab bar for page selection |
| `app/src/app/(dashboard)/[id]/edit/page.tsx` | Modify | Add tab bar + page management in edit mode |
| `app/src/components/page-tabs.tsx` | Create | Reusable page tab bar component |

---

## Implementation Order

1. **6A** — Dashboard card options (quick win, ~30 min)
2. **6B** — Dashboard metadata (moderate, ~2 hours)
3. **6C** — Dashboard pages (largest, ~4-6 hours)

---

## Acceptance Criteria

### 6A
- [ ] Dashboard cards have a three-dot dropdown menu with Edit, View, Delete options
- [ ] Delete only shows for owners
- [ ] Consistent with widget card action pattern

### 6B
- [ ] `updatedBy` field in database schema
- [ ] Dashboard viewer shows last updated info
- [ ] Dashboard list cards show "Updated X ago" and widget count

### 6C
- [ ] Dashboards support multiple pages
- [ ] Tab bar visible in both view and edit modes
- [ ] Can add, rename, delete pages in edit mode
- [ ] Existing dashboards (v1) auto-migrate to single-page v2
- [ ] Widgets are scoped to their page
- [ ] Page selection persists during view session
