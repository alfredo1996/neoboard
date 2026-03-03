# Component Package Cleanup & Simplification

## Context

The `component/` package has grown to 66 composed components, but **24 of them (36%) are not imported by `app/`** — the only consumer. These components add maintenance burden, inflate the test suite, and increase build times without delivering value. Additionally, the `query-editor.tsx` has repeated DOM cleanup patterns that can be simplified.

## Scope

1. **Remove 24 unused composed components** (source + tests + stories)
2. **Update stories for kept components** that reference deleted components
3. **Extract repeated cleanup pattern** in `query-editor.tsx`
4. **Clean up barrel exports** in `composed/index.ts`
5. **Verify** build, tests, and lint pass after changes

## Step 1: Delete 24 Unused Composed Components

Each component has 3 files to remove: source, test, and story.

| # | Component | Source | Test | Story |
|---|-----------|--------|------|-------|
| 1 | SearchInput | `composed/search-input.tsx` | `composed/__tests__/search-input.test.tsx` | `stories/composed/search-input.stories.tsx` |
| 2 | StatCard | `composed/stat-card.tsx` | `composed/__tests__/stat-card.test.tsx` | `stories/composed/stat-card.stories.tsx` |
| 3 | MetricCard | `composed/metric-card.tsx` | `composed/__tests__/metric-card.test.tsx` | `stories/composed/metric-card.stories.tsx` |
| 4 | KeyValueList | `composed/key-value-list.tsx` | `composed/__tests__/key-value-list.test.tsx` | `stories/composed/key-value-list.stories.tsx` |
| 5 | CodeBlock | `composed/code-block.tsx` | `composed/__tests__/code-block.test.tsx` | `stories/composed/code-block.stories.tsx` |
| 6 | InputGroup | `composed/input-group.tsx` | `composed/__tests__/input-group.test.tsx` | `stories/composed/input-group.stories.tsx` |
| 7 | RangeSlider | `composed/range-slider.tsx` | `composed/__tests__/range-slider.test.tsx` | `stories/composed/range-slider.stories.tsx` |
| 8 | FilterChip | `composed/filter-chip.tsx` | `composed/__tests__/filter-chip.test.tsx` | `stories/composed/filter-chip.stories.tsx` |
| 9 | FilterBar | `composed/filter-bar.tsx` | `composed/__tests__/filter-bar.test.tsx` | `stories/composed/filter-bar.stories.tsx` |
| 10 | DataGridToolbar | `composed/data-grid-toolbar.tsx` | `composed/__tests__/data-grid-toolbar.test.tsx` | *(used in data-grid.stories — update needed)* |
| 11 | DataGridRowActions | `composed/data-grid-row-actions.tsx` | `composed/__tests__/data-grid-row-actions.test.tsx` | *(used in data-grid.stories — update needed)* |
| 12 | GridItem | `composed/grid-item.tsx` | `composed/__tests__/grid-item.test.tsx` | *(no dedicated story)* |
| 13 | VerticalTabs | `composed/vertical-tabs.tsx` | `composed/__tests__/vertical-tabs.test.tsx` | `stories/composed/vertical-tabs.stories.tsx` |
| 14 | ControlledPagination | `composed/controlled-pagination.tsx` | `composed/__tests__/controlled-pagination.test.tsx` | `stories/composed/controlled-pagination.stories.tsx` |
| 15 | RefreshControl | `composed/refresh-control.tsx` | `composed/__tests__/refresh-control.test.tsx` | `stories/composed/refresh-control.stories.tsx` |
| 16 | ChartContextMenu | `composed/chart-context-menu.tsx` | `composed/__tests__/chart-context-menu.test.tsx` | `stories/composed/chart-context-menu.stories.tsx` |
| 17 | ChartTypePicker | `composed/chart-type-picker.tsx` | `composed/__tests__/chart-type-picker.test.tsx` | `stories/composed/chart-type-picker.stories.tsx` |
| 18 | ColorPicker | `composed/color-picker.tsx` | `composed/__tests__/color-picker.test.tsx` | `stories/composed/color-picker.stories.tsx` |
| 19 | StatusDot | `composed/status-dot.tsx` | `composed/__tests__/status-dot.test.tsx` | `stories/composed/status-dot.stories.tsx` |
| 20 | GraphLegend | `composed/graph-legend.tsx` | `composed/__tests__/graph-legend.test.tsx` | `stories/composed/graph-legend.stories.tsx` |
| 21 | CopyButton | `composed/copy-button.tsx` | `composed/__tests__/copy-button.test.tsx` | `stories/composed/copy-button.stories.tsx` |
| 22 | DataSourcePicker | `composed/data-source-picker.tsx` | `composed/__tests__/data-source-picker.test.tsx` | `stories/composed/data-source-picker.stories.tsx` |
| 23 | AvatarGroup | `composed/avatar-group.tsx` | `composed/__tests__/avatar-group.test.tsx` | `stories/composed/avatar-group.stories.tsx` |
| 24 | TruncatedText | `composed/truncated-text.tsx` | `composed/__tests__/truncated-text.test.tsx` | `stories/composed/truncated-text.stories.tsx` |

**Total files deleted: ~72** (24 source + 24 tests + ~24 stories)

## Step 2: Update Barrel Exports

**File:** `component/src/components/composed/index.ts`

Remove all 24 export lines for deleted components. The file goes from 137 lines to ~95 lines.

## Step 3: Update Stories That Reference Deleted Components

These stories for **kept** components import **deleted** components as demo content:

| Story File | Deleted Import(s) | Fix |
|---|---|---|
| `stories/composed/dashboard-grid.stories.tsx` | `StatCard` | Replace with simple `<div>` placeholder content |
| `stories/composed/app-shell.stories.tsx` | `StatCard` | Replace with simple `<div>` placeholder content |
| `stories/composed/chart-settings-panel.stories.tsx` | `ChartTypePicker`, `ColorPicker` | Replace with plain `<select>` or inline UI |
| `stories/composed/data-grid.stories.tsx` | `DataGridToolbar`, `DataGridRowActions` | Remove toolbar/row-action demo variants or inline the UI |

## Step 4: Refactor query-editor.tsx Cleanup Pattern

**File:** `component/src/components/composed/query-editor.tsx`

The DOM cleanup pattern is repeated 4 times (lines 170-177, 211-217, 239-243, 261-266). Extract into two helpers:

```ts
/** Destroy the CM editor view and clear its DOM mount point. */
function destroyEditor(
  viewRef: React.RefObject<CMEditorView>,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  if (viewRef.current) {
    viewRef.current.destroy();
    viewRef.current = null;
  }
  clearContainer(containerRef);
}

/** Remove all children from the CodeMirror container element. */
function clearContainer(
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  if (containerRef.current) {
    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }
  }
}
```

Then replace all 4 occurrences with calls to `destroyEditor()` or `clearContainer()`.

## Step 5: Verify

1. `cd component && npm test` — all remaining tests pass
2. `npm run lint` — no lint errors
3. `npm run build` — no type errors
4. `npm run storybook` — builds without broken imports (quick smoke test)

## Files Modified Summary

- **Deleted:** ~72 files (24 components + 24 tests + ~24 stories)
- **Edited:** `composed/index.ts` (remove 24 exports), `query-editor.tsx` (extract helpers), 4 story files (remove deleted component references)
- **Net reduction:** ~3,000+ lines of code removed

## UI Components (All Kept)

All 33 UI components in `component/src/components/ui/` are actively used by composed components — none are unused.

## Analysis Summary

| Metric | Before | After |
|--------|--------|-------|
| Composed components | 66 | 42 |
| Test files (composed) | 66 | 42 |
| Story files (composed) | ~50 | ~26 |
| Barrel export lines | 137 | ~95 |
