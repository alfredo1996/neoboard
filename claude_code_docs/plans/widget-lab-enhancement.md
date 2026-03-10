# Widget Lab Enhancement Plan

## Summary

Upgrade the Widget Lab from a text-oriented catalog into a visual, editable workspace. Three core capabilities:

1. **Editable templates** -- Open a template in the Widget Editor directly from Widget Lab to edit its query, chart type, settings, etc. Also allow creating *new* templates from scratch (not just saving from a dashboard widget). Edits to a template do not automatically propagate to dashboard widgets (existing sync mechanism remains opt-in).
2. **Chart preview renders** -- Widget Lab cards display a live mini-chart render (bar/line/pie/table/etc.) instead of showing the raw query text.
3. **"From Template" visual picker** -- The Browse Templates step inside the Add Widget modal shows chart preview thumbnails instead of plain text-only list items.

Plus meaningful E2E tests for all three features.

---

## Architecture Decision

### Template previews: snapshot vs live render

**Decision: Static snapshot approach (PNG data-URI stored in DB).**

Rationale:
- Live rendering requires a DB connection + query execution for every template card. On the Widget Lab page with dozens of templates this means dozens of concurrent queries -- unacceptable for performance and security (templates may reference connections the viewer cannot access).
- A static preview snapshot is generated once when a template is saved or edited. It is stored as a `previewImageUrl` column (text, data-URI or blob storage URL) on the `widget_templates` table.
- The preview is re-generated on each template save/update.
- Chart types that cannot produce a static preview (graph, map, parameter-select, form) fall back to a Lucide icon placeholder with the chart type label.

### Template editing flow

**Decision: Reuse `WidgetEditorModal` in a new "lab" mode.**

- The existing `WidgetEditorModal` already handles connection selection, query editing, chart type, chart options, and live preview. Rather than duplicating, we add a `mode: "lab-edit" | "lab-create"` variant.
- In lab mode the save handler calls `PUT /api/widget-templates/:id` (edit) or `POST /api/widget-templates` (create) instead of modifying a dashboard widget.
- After a successful save, a preview snapshot is captured from the preview pane and sent along as `previewImageUrl`.

### Preview capture mechanism

**Decision: `html2canvas` or `HTMLCanvasElement.toDataURL` on the preview pane.**

- After the user clicks "Save" in lab mode, we capture the `[data-testid="widget-preview"]` element using `html2canvas` (lightweight, already client-side).
- The resulting data-URI (PNG, max ~200KB after resize) is sent in the PUT/POST request body.
- Alternative considered: server-side Playwright screenshot -- rejected because it adds a heavy dependency and complicates the API.

---

## Affected Packages

| Package | Impact |
|---------|--------|
| `app/` | Widget Lab page, widget-editor-modal (lab mode), API routes (update template with preview), hooks, E2E tests, DB migration |
| `component/` | New `TemplatePreviewCard` component for rendering a template card with an image preview and fallback icon |
| `connection/` | None |

---

## Ordered Tasks

### Phase 1: DB Migration & API (S)

**Task 1.1 -- Add `previewImageUrl` column to `widget_templates` (S)**
- File: `app/src/lib/db/schema.ts` -- add `previewImageUrl: text("previewImageUrl")` (nullable).
- Generate migration: `npm run db:generate`
- Verify migration is forward-only and idempotent.

**Task 1.2 -- Update API routes to accept `previewImageUrl` (S)**
- `app/src/app/api/widget-templates/route.ts` (POST) -- add `previewImageUrl` to `createTemplateSchema`.
- `app/src/app/api/widget-templates/[id]/route.ts` (PUT) -- add `previewImageUrl` to `updateTemplateSchema`.
- Vitest tests: validate the field is accepted and persisted.

**Task 1.3 -- Add `useUpdateWidgetTemplate` hook (S)**
- File: `app/src/hooks/use-widget-templates.ts` -- new mutation wrapping `PUT /api/widget-templates/:id`.
- Invalidates `["widget-templates"]` query key on success.
- Unit test the hook shape (Vitest, mocked fetch).

### Phase 2: Template Editing in Widget Lab (M)

**Task 2.1 -- Extend `WidgetEditorModal` with lab modes (M)**
- Add `mode: "lab-edit" | "lab-create"` to `WidgetEditorModalProps`.
- When mode is `lab-edit`:
  - Accept a `template: WidgetTemplate` prop.
  - Initialize state from template fields (chartType, query, settings, etc.).
  - Dialog title: "Edit Template".
  - Save button calls `useUpdateWidgetTemplate`.
  - After save, capture preview snapshot (Task 2.3) and update template.
- When mode is `lab-create`:
  - Dialog title: "Create Template".
  - Save calls `useCreateWidgetTemplate`.
  - Also captures preview snapshot.
- Both modes show a "Name" and "Description" field in addition to the existing editor.
- Connection selector shows all available connections (fetched via `useConnections` within the modal or passed as prop from Widget Lab page).
- No dashboard layout prop needed (no click actions, no page navigation in lab context).

**Task 2.2 -- Update Widget Lab page with edit + create actions (M)**
- File: `app/src/app/(dashboard)/widget-lab/page.tsx`.
- Add a "New Template" button (top-right, next to filters) that opens `WidgetEditorModal` in `lab-create` mode.
- Each `TemplateCard` gets an "Edit" button (visible to owner or admin) that opens `WidgetEditorModal` in `lab-edit` mode.
- Fetch connections via `useConnections()` to pass to the modal.

**Task 2.3 -- Preview snapshot capture utility (S)**
- New file: `app/src/lib/capture-preview.ts`.
- `capturePreview(element: HTMLElement): Promise<string>` -- uses `html2canvas` to capture the element and returns a resized data-URI (max 400x300 px, JPEG 0.7 quality to keep under 100KB).
- Install `html2canvas` as a dependency: `npm install html2canvas`.
- Unit test: mock canvas APIs, verify output format.

### Phase 3: Chart Preview Renders in Widget Lab (M)

**Task 3.1 -- Create `TemplatePreviewCard` component (M)**
- Package: `component/src/components/composed/template-preview-card.tsx`.
- Props: `name`, `description`, `chartType`, `connectorType`, `tags`, `previewImageUrl`, `onEdit`, `onDelete`, `canEdit`, `canDelete`, `createdAt`.
- Renders: preview image (or fallback Lucide icon + chart type label), name, description, badges, action buttons.
- Aspect ratio: 16:10 for preview area.
- Export from `component/src/index.ts`.
- Vitest + RTL test in `component/`.

**Task 3.2 -- Replace `TemplateCard` with `TemplatePreviewCard` on Widget Lab page (S)**
- File: `app/src/app/(dashboard)/widget-lab/page.tsx`.
- Remove inline `TemplateCard` function.
- Import `TemplatePreviewCard` from `@neoboard/components`.
- Wire `onEdit` and `onDelete` props.
- Grid layout: `sm:grid-cols-2 lg:grid-cols-3` (same as current, preview images make cards taller).

### Phase 4: Visual "From Template" Picker in Add Widget Modal (M)

**Task 4.1 -- Upgrade Browse Templates step in WidgetEditorModal (M)**
- File: `app/src/components/widget-editor-modal.tsx`, `dialogStep === "templates"` branch.
- Replace the plain text buttons with `TemplatePreviewCard` components (without edit/delete actions -- only a "Use" button or click-to-apply).
- Show the `previewImageUrl` if available, otherwise the fallback icon.
- Layout: grid `sm:grid-cols-2 lg:grid-cols-3` with scroll.
- Search/filter within the template picker (reuse existing connectorType filter, add text search).

### Phase 5: E2E Tests (M)

**Task 5.1 -- E2E: Create template from Widget Lab (M)**
- File: `app/e2e/widget-lab.spec.ts` (extend existing suite).
- Test: Click "New Template" -> fill in name, select connection, type query, run preview, save -> verify template appears in Widget Lab with a preview image.
- Cleanup: delete template via API.

**Task 5.2 -- E2E: Edit template from Widget Lab (M)**
- Test: Create template via API -> go to Widget Lab -> click Edit on the template card -> modify title/query -> save -> verify updated values appear.
- Test: Verify non-owner (different user) cannot see Edit button (or gets 403 on API).

**Task 5.3 -- E2E: Preview image renders on template cards (S)**
- Test: Create template via API with a known query -> navigate to Widget Lab -> verify `img` element is visible within the template card (or verify the fallback icon for chart types without preview).

**Task 5.4 -- E2E: "From Template" shows chart previews (S)**
- Test: Create template with preview -> open Add Widget modal -> click "From Template" -> verify `img` element is visible within the template picker -> apply template -> verify query is populated.

**Task 5.5 -- E2E: Template edits do not affect existing dashboard widgets (M)**
- Test: Create template via API -> create dashboard widget from that template -> edit template in Widget Lab (change query/title) -> verify dashboard widget is unchanged (no auto-sync) -> verify "Template update available" indicator appears.

---

## Migration Needed?

**Yes.** One forward-only migration:
- Add `previewImageUrl TEXT` column to `widget_template` table (nullable, no default).
- No data migration needed -- existing templates will have `NULL` preview, which falls back to the icon placeholder.

```sql
ALTER TABLE widget_template ADD COLUMN "previewImageUrl" TEXT;
```

---

## Security Checklist

- [ ] `previewImageUrl` is a data-URI generated client-side. Validate on the API that it starts with `data:image/` and is under 500KB to prevent abuse.
- [ ] Template edit/create still enforces `canWrite` permission server-side.
- [ ] Template edit still enforces ownership (`createdBy === userId || role === 'admin'`).
- [ ] `tenant_id` filter is applied on all template queries (already in place).
- [ ] Preview images do not leak sensitive data: they are chart renders of query results, same data the user already has access to. No additional exposure.
- [ ] `html2canvas` runs entirely client-side; no server-side rendering of user content.
- [ ] No credentials or connection details are stored in the preview image.

---

## Testing Strategy

| Layer | What | Tool |
|-------|------|------|
| API routes | Validate previewImageUrl field accepted/rejected, size limits | Vitest (app/) |
| Hook | `useUpdateWidgetTemplate` invalidates cache | Vitest (app/) |
| Utility | `capturePreview` output format and size | Vitest (app/) |
| Component | `TemplatePreviewCard` renders image/fallback, fires callbacks | Vitest + RTL (component/) |
| E2E | Create/edit template from Widget Lab, preview renders, template picker with previews, no auto-sync | Playwright |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `html2canvas` cannot render ECharts canvas elements | Medium | High | Test early. Fallback: use ECharts' built-in `getDataURL()` API via a ref forwarded from chart components. |
| Preview images bloat the database | Low | Medium | Enforce max size (100KB JPEG). Consider moving to blob storage later if templates scale to 1000+. |
| Widget Lab page becomes slow with many preview images | Low | Medium | Lazy-load images with `loading="lazy"` + intersection observer. Paginate templates if count > 50. |
| ECharts `getDataURL()` not available for all chart types (graph/map) | Medium | Low | These types already fall back to icon placeholder. Only bar/line/pie/single-value/table need real previews. |
| Reusing WidgetEditorModal for lab mode increases complexity | Medium | Medium | Keep lab-specific logic isolated behind the mode prop. Extract shared logic into custom hooks if the component exceeds ~1200 lines. |

---

## Suggested GitHub Issues

### Issue 1: Widget Lab -- Template Editing and Creation
**Labels:** `feat`, `app`, `widget-lab`
**Milestone:** v0.5

Allow users to edit existing widget templates and create new templates directly from the Widget Lab page, without needing a dashboard widget first. Opens the WidgetEditorModal in a new "lab" mode.

Tasks: 2.1, 2.2

### Issue 2: Widget Lab -- Chart Preview Renders
**Labels:** `feat`, `app`, `component`, `widget-lab`
**Milestone:** v0.5

Show chart preview images on Widget Lab template cards instead of raw query text. Includes DB migration for `previewImageUrl`, preview capture utility, and the `TemplatePreviewCard` component.

Tasks: 1.1, 1.2, 1.3, 2.3, 3.1, 3.2

### Issue 3: "From Template" Visual Picker
**Labels:** `enhancement`, `app`, `widget-lab`
**Milestone:** v0.5

Upgrade the Browse Templates step in the Add Widget modal to show chart preview thumbnails instead of plain text buttons.

Tasks: 4.1

### Issue 4: Widget Lab Enhancement E2E Tests
**Labels:** `test`, `app`, `e2e`
**Milestone:** v0.5

Comprehensive E2E tests for template creation, editing, preview renders, visual template picker, and isolation from dashboard widgets.

Tasks: 5.1, 5.2, 5.3, 5.4, 5.5

---

## Implementation Order

```
Phase 1 (DB + API)  -->  Phase 2 (Editing)  -->  Phase 3 (Previews)  -->  Phase 4 (Picker)  -->  Phase 5 (E2E)
      S                       M                        M                       M                     M
```

Total estimated effort: **L** (sum of phases)

Recommended approach: tackle Phases 1-2 together as a single PR (template editing), then Phases 3-4 as a second PR (visual previews), and Phase 5 tests woven into both PRs.
