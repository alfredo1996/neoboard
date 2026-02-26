# Code Review Findings — PR #67 Parameter Selectors

> Generated 2026-02-25 during post-implementation code review.
> Updated 2026-02-26 — completed items removed; widget editor sizing issues added.

---

## Pending Feature Improvements

These require design decisions or broader changes and should be planned as separate issues.

---

### 7. App-layer test coverage gap

**Current state:** `app/` package has ~44% statement coverage (target: >70%).

**Key untested areas:**
- `src/app/api/users/route.ts` — 0% (CRUD user management API)
- `src/app/api/users/[id]/route.ts` — 0%
- `src/hooks/use-connections.ts`, `use-dashboards.ts`, `use-users.ts` — 0% (React Query hooks)
- `src/components/parameter-widget-renderer.tsx` — 0% component-level (logic tested via store)
- `src/lib/query-executor.ts` — 0%
- `src/lib/crypto.ts` — 0%

**Suggested approach:**
- Prioritize API route tests (pure function, easy to mock Drizzle)
- Add RTL (React Testing Library) tests for ParameterWidgetRenderer mounting with different parameterType props
- Hook tests require msw (Mock Service Worker) for fetch mocking

**Priority:** Medium (SonarQube quality gate)

---

### 14. Widget editor dialog bypasses the component library size variant system

**File:** `app/src/components/widget-editor-modal.tsx` (line 572)

**Problem:** `DialogContent` is rendered with a raw `className="sm:max-w-6xl"` instead of using the CVA `size` prop defined in `component/src/components/ui/dialog.tsx`. The component library defines `sm`, `md`, `lg`, `xl`, and `full` variants — none of which cover the 6xl (1152px) range. This bypasses the design system and makes the dialog immune to future global dialog sizing changes.

**Suggested approach:**
- Add a `2xl` (or `7xl`) size variant to `dialogContentVariants` in `dialog.tsx`:
  ```typescript
  "2xl": "max-w-5xl",   // 1024px — or whatever the design decision lands on
  ```
- Replace `className="sm:max-w-6xl"` in the modal with `size="2xl"` (or `size="full"`)
- Consider whether the `full` variant (`calc(100vw - 2rem)`) is already sufficient for the widget editor use case

**Priority:** Low (design system consistency, no user-visible regression)

---

### 15. Widget editor preview panel is shorter than the left column

**File:** `app/src/components/widget-editor-modal.tsx` (lines 581, 998)

**Problem:** The two-column layout has a left column capped at `max-h-[500px]` and a right-column preview pane fixed at `h-[320px]`. The 180px height gap means the preview ends well before the left column can grow to its maximum — creating visible dead space in the right column at most content heights, as seen in the screenshot.

**Suggested approach:**
- Align the preview height to the left column cap, e.g. `h-[500px]` or use a percentage of the body height
- Alternatively, make the preview use `flex-1` with a `min-h` floor (as the Storybook prototype does: `flex-1 min-h-[400px]`) so it fills whatever vertical space remains

**Priority:** Medium (visual polish — dead space is immediately visible)

---

### 16. Production body/column heights diverged from Storybook prototype

**File:** `app/src/components/widget-editor-modal.tsx` (lines 579, 581)

**Problem:** The Storybook prototype (`widget-editor-prototype.stories.tsx`) uses slightly larger dimensions than what was shipped to production:

| Dimension | Storybook prototype | Production |
|---|---|---|
| Body `min-h` | `520px` | `450px` |
| Left column `max-h` | `560px` | `500px` |
| Preview height | `flex-1 min-h-[400px]` | fixed `h-[320px]` |

The prototype's flexible preview (`flex-1`) fills available vertical space naturally. Production hardcoded it to 320px and reduced the overall body height, which shrank the modal and introduced the dead space below the preview placeholder.

**Suggested approach:**
- Restore the prototype's `min-h-[520px]` for the body and `max-h-[560px]` for the left column
- Replace the fixed `h-[320px]` preview with `flex-1 min-h-[400px]` so it fills the remaining space

**Priority:** Medium (directly responsible for the visible empty space in the right column)

---

### 17. Dialog has no viewport-height guard

**File:** `app/src/components/widget-editor-modal.tsx` (line 572)

**Problem:** The dialog has no `max-h-[90vh]` (or equivalent) constraint. On laptops or displays shorter than ~700px, the dialog content will overflow the viewport and the bottom buttons (Cancel / Add Widget) will be inaccessible without scrolling — but no scroll is present on the dialog itself because `overflow-y` is only set on the left column, not on the dialog wrapper.

**Suggested approach:**
```tsx
<DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto flex flex-col">
```
Or alternatively, apply `overflow: hidden` on the dialog and let only the inner columns scroll (the left column already has `overflow-y-auto`).

**Priority:** Medium (accessibility — affects users on smaller/lower-resolution displays)

---

### 18. Left column scroll region rarely triggers but always reserves space

**File:** `app/src/components/widget-editor-modal.tsx` (line 581)

**Problem:** `overflow-y-auto max-h-[500px]` on the left column creates a scroll container that only activates when content exceeds 500px. In practice, the Data tab content (title input + connection + chart type + query editor) fits within ~420–450px, so the scrollbar never appears — but the `max-h` silently reserves the full 500px, leaving blank white space below the query editor visible in the screenshot.

**Suggested approach:**
- Remove the fixed `max-h-[500px]` from the left column and instead constrain it via the grid row height (driven by the dialog's `max-h` guard from finding #17)
- This allows the column to size to its content on short forms and still scroll when tabs like "Advanced" add more options
- If a hard cap is needed, tie it to the dialog height: `max-h-[calc(90vh-180px)]` (accounting for header + footer)

**Priority:** Low-Medium (causes visible whitespace at standard viewport sizes)

---

### 19. Graph widget — node/relationship captions show `[object Object]`

**File:** `component/src/charts/graph-chart.tsx` (line 152)

**Problem:** `resolveCaption()` uses `String(val)` to stringify the selected caption property:
```typescript
if (val !== null && val !== undefined) return String(val);
```
`String()` on a plain object produces `[object Object]`. Neo4j properties can be non-primitive — e.g. nested maps, spatial `Point` objects, or Integer `{low, high}` structs from the JS driver. Users who select such a property as the node caption see `[object Object]` on every node in the graph.

A `normalizeValue()` utility already exists in `app/src/lib/normalize-value.ts` that handles Neo4j Integer, DateTime, Date, Time, and generic object fallback via `JSON.stringify`. It is not currently applied to graph captions.

**Fix:**
- Move / copy the relevant normalization logic into `component/src/charts/graph-chart.tsx` (the component library cannot import from `app/`)
- Replace `String(val)` with a local helper that handles the Neo4j driver types:
  ```typescript
  function primitiveString(val: unknown): string {
    if (typeof val === "object" && val !== null) {
      // Neo4j Integer {low, high}
      if ("low" in val && "high" in val) return String((val as {low: number}).low);
      return JSON.stringify(val);
    }
    return String(val);
  }
  ```

**Priority:** High (user-visible corruption of graph node labels)

---

### 20. Graph widget — no modal to inspect node/relationship properties

**Files:**
- `component/src/components/composed/property-panel.tsx` (exists, exported, tested)
- `app/src/components/graph-exploration-wrapper.tsx`
- `component/src/charts/graph-chart.tsx`

**Problem:** Clicking or right-clicking a graph node only shows "Expand / Collapse" actions (`NodeContextMenu`). There is no way to view the full property set of a node or relationship. The `PropertyPanel` component in `component/` is fully built, tested, exported, and has a "GraphNodeInspector" Storybook example — but it is not wired to any graph interaction.

**Suggested approach:**
- Add an `onNodeClick` (or `onNodeDoubleClick`) callback to `graph-chart.tsx` that emits the clicked `GraphNode` to the parent
- In `graph-exploration-wrapper.tsx` (the app-layer coordinator), hold state for `selectedNode: GraphNode | null`
- When `selectedNode` is set, render a shadcn `Sheet` or `Dialog` containing `PropertyPanel`, mapping `selectedNode.properties` to `PropertySection[]`
- Do the same for edge/relationship clicks via the existing `onRelationshipClick` callback

**Priority:** High (core graph UX — properties are completely inaccessible to the user)

---

### 21. "Waiting for parameters" placeholder doesn't name the missing parameters

**File:** `app/src/components/card-container.tsx` (lines 503–510)

**Problem:** When a widget's query references `$param_xxx` tokens that have not been set yet, the widget shows:
> Waiting for parameters…

The message is generic and gives no indication of which parameter widgets the user needs to interact with. On a dashboard with several parameter widgets, the user must guess which one is blocking each data widget.

The `allReferencedParamsReady()` function in `use-widget-query.ts` already scans the query with `/\$param_(\w+)/g` to find referenced names — it just discards the list of missing names instead of returning them.

**Suggested approach:**
- Refactor `allReferencedParamsReady` to return `string[]` (the missing param names) instead of `boolean`
- In `card-container.tsx`, render the missing names in the placeholder:
  ```tsx
  <p className="text-sm text-muted-foreground text-center">
    Waiting for: {missingParams.map(n => (
      <code key={n} className="font-mono">$param_{n}</code>
    )).reduce(/* comma-join */)}
  </p>
  ```
- Update `use-widget-query.ts` tests to cover the new return type

**Priority:** Medium (usability — helps users quickly identify which parameter widget to fill)

---

### 22. Dashboard widget queries have no server-side row limit

**Files:**
- `app/src/app/api/query/route.ts`
- `app/src/lib/query-executor.ts`
- `app/src/hooks/use-widget-query.ts`

**Problem:** `wrapWithPreviewLimit` (25 rows) is only applied client-side in the widget editor's **Preview** button path. On the live dashboard, widgets call `/api/query` with the raw unbounded user query. The backend `executeQuery()` applies no row cap. A query returning millions of rows will transfer all of them to the client, exhausting memory and network bandwidth.

The `pageSize` chart option only controls how many rows are *displayed* — it does not limit how many rows are *fetched*. A user setting `pageSize = 10` still receives all rows from the server.

**Suggested approach:**
- Add a `MAX_ROWS` constant (e.g. 10 000) to the API route
- After `executeQuery()` returns, truncate the result rows to `MAX_ROWS` and include a `truncated: true` flag in the response when rows were cut
- Alternatively, enforce the cap inside `query-executor.ts` so it applies uniformly to all callers
- In the widget (table/chart), display a subtle banner when `truncated === true`: "Showing first 10 000 rows. Refine your query to see all results."
- **Do NOT** add `LIMIT` to the user's query — this would violate the query-safety rule in `CLAUDE.md`. Truncate the result set after execution.

**Priority:** High (safety + performance — unbounded queries can crash the server process)

---

### 23. Chart options tooltip — HelpCircle icon should be removed; tooltip should trigger on the label text

**File:** `component/src/components/composed/chart-options-panel.tsx` (lines 30–46)

**Problem:** The current implementation appends a `HelpCircle` icon after each option label when `description` is set. The icon is small (h-3 w-3), visually clutters the options list, and is redundant — the label text itself is a more natural and discoverable hover target.

**Current:**
```tsx
<Label ...>{option.label} <HelpCircle .../></Label>
// HelpCircle is the TooltipTrigger
```

**Desired:**
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Label className="cursor-help underline decoration-dotted">{option.label}</Label>
  </TooltipTrigger>
  <TooltipContent ...>{option.description}</TooltipContent>
</Tooltip>
```

**Suggested approach:**
- Remove the `HelpCircle` import and icon
- Wrap the `<Label>` itself in `<TooltipTrigger asChild>` when `description` is set
- Apply `cursor-help` and a subtle `underline decoration-dotted` on the label so the hover target is still discoverable without an icon

**Priority:** Low (UX polish — the tooltip feature works, this is a presentation refinement)

---

### 24. Table widget — sort UI renders even when `enableSorting` is disabled

**Files:**
- `component/src/components/composed/data-grid.tsx` (line 157)
- `component/src/components/composed/data-grid-column-header.tsx` (line 29)
- `app/src/components/card-container.tsx` (line 283)

**Problem:** When `enableSorting = false`, `DataGrid` omits `getSortedRowModel` from `useReactTable` but does **not** pass `enableSorting: false` to the table config:
```typescript
// data-grid.tsx line 157 — only the row model is omitted
getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
// table.options.enableSorting is never set → defaults to true inside TanStack Table
```

`DataGridColumnHeader` guards on `column.getCanSort()` (line 29). TanStack Table computes `getCanSort()` from `table.options.enableSorting` (not from whether `getSortedRowModel` was provided), so it returns `true` even when no sort model is registered. As a result, every column header still renders the sort button with `ChevronsUpDown` + sort dropdown — clicking "Asc" or "Desc" fires `column.toggleSorting()` but the rows never reorder because no sorted row model exists.

Additionally, `card-container.tsx` line 283 defaults `enableSorting` to `true` (`settings.enableSorting !== false`), so sorting is on unless explicitly disabled in the chart options.

**Fix:**
```typescript
// data-grid.tsx — also pass the flag to TanStack Table
const table = useReactTable({
  ...
  enableSorting,                                              // ← ADD THIS
  getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
  ...
});
```
With `enableSorting: false` in the table options, `column.getCanSort()` returns `false`, and `DataGridColumnHeader` falls back to a plain `<div>` with no sort UI.

**Priority:** Medium (confusing UX — buttons appear that silently do nothing)

---

## Summary

| #  | Finding                                              | Severity    | Status  |
|----|------------------------------------------------------|-------------|---------|
| 7  | App-layer test coverage gap                          | Quality     | Pending |
| 14 | Dialog bypasses CVA size variant system              | Design sys. | ✅ PR #75 |
| 15 | Preview panel 180px shorter than left column cap     | UX          | ✅ PR #75 |
| 16 | Production heights diverged from Storybook prototype | UX          | ✅ PR #75 |
| 17 | No viewport-height guard on dialog                   | A11y / UX   | ✅ PR #75 |
| 18 | Left column max-h leaves empty white space           | UX          | ✅ PR #75 |
| 19 | Graph captions show `[object Object]` for non-primitive properties | Bug | ✅ PR #74 |
| 20 | Graph widget — no modal to inspect node/relationship properties | UX | ✅ PR #74 |
| 21 | "Waiting for parameters" doesn't name missing params | UX          | ✅ PR #74 |
| 22 | Dashboard queries have no server-side row limit      | Safety      | ✅ PR #74 (post-fetch cap, 10 000 rows) |
| 23 | Chart options tooltip should trigger on label text, not icon | UX   | ✅ PR #75 |
| 24 | Table sort UI renders even when sorting is disabled  | Bug / UX    | ✅ PR #75 |
