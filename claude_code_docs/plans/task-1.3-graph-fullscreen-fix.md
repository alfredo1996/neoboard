# Task 1.3 — Graph Right-Click / Hover Broken in Fullscreen

**Parent issue:** #93 (Widget UX Polish)
**Parent plan:** `issue-93-plan.md`
**Size:** S (Small)
**Date:** 2026-03-10

---

## Summary

When a graph widget is opened fullscreen via the Radix Dialog in `DashboardContainer`, two things break:

1. **Viewport mismatch:** NVL initializes its canvas dimensions from the container size at mount time. The fullscreen `<Dialog>` renders `CardContainer` into a `<div className="flex-1 min-h-0">` inside `<DialogContent className="sm:max-w-[90vw] h-[85vh] flex flex-col">`. However, the NVL instance inside `GraphChart` was already mounted in the dashboard grid at a much smaller size. When the fullscreen dialog opens, it renders a **new** `CardContainer` (line 248 of `dashboard-container.tsx`), which creates a fresh NVL instance. The issue is that NVL computes its canvas size from the container at construction time, but the Radix Dialog's open animation means the container may not yet have its final dimensions when NVL mounts. The `onLayoutDone` callback fires `fitGraph()` but the canvas may still have incorrect bounds.

2. **Right-click / hover positioning:** The context menu uses `event.clientX` and `event.clientY` from `onNodeRightClick`, which works correctly because the context menu is portaled to `document.body` (z-[500]). This is already handled. The actual issue is that NVL's internal hit-testing is based on canvas coordinates that were computed at initialization, so if the canvas was sized incorrectly at mount, right-clicks on nodes won't hit the expected targets, and hovers won't trigger correctly.

**Root cause:** NVL's `fitCanvasSizeToParent` is called at construction time. If the container's computed dimensions haven't settled (because of CSS transitions/animations in the Radix Dialog), the canvas pixel buffer is set to wrong dimensions. Subsequent `fit()` calls update pan/zoom but don't re-measure the canvas DOM size.

---

## Architecture Decision

The fix applies at three levels:

### AD-1: `autoFit` prop on `GraphChart` (component/ package)

Add an `autoFit?: boolean` prop to `GraphChart`. When `true`, after mount, the component runs a `fit()` call with a `requestAnimationFrame` + small delay (150ms) to let the container finalize its dimensions. This is a **generic** prop that any consumer can use when the container size may change after initial mount.

**Why not a `ResizeObserver`?** NVL internally uses `fitCanvasSizeToParent` which reads from `parentElement.clientWidth/Height`. A `ResizeObserver` on the wrapping `<div>` could call `fit()` on size changes, but NVL's canvas doesn't auto-resize just from a `fit()` call. The `InteractiveNvlWrapper` from `@neo4j-nvl/react` doesn't expose a public `resize()` or `updateDimensions()` method. The workaround is: after the container stabilizes, we need to trigger NVL to recalculate by calling `nvlRef.current.fit()` which internally reads the current container size for pan/zoom calculations. This, combined with the dialog's CSS animation settling, resolves the viewport mismatch.

**Fallback approach:** If `fit()` alone is insufficient because the canvas pixel buffer is wrong (NVL uses `fitCanvasSizeToParent` only at construction), the more robust fix is to **force a remount** of the graph component when entering fullscreen. This is done by changing the `key` prop on the `CardContainer` in the fullscreen dialog. A new key forces React to unmount/remount, so NVL constructs with the correct container dimensions after the dialog's animation completes.

### AD-2: Fullscreen dialog renders with remount key (app/ package)

In `DashboardContainer`, when rendering the fullscreen `<CardContainer>`, add `key={fullscreenWidget.id + '-fullscreen'}` to force a fresh mount. The existing non-fullscreen `CardContainer` for the same widget keeps its original `key` (the widget ID via the `page.widgets.map`). This guarantees NVL initializes with the correct container dimensions.

Additionally, add a small delay before mounting by using a state flag `isFullscreenReady` that is set `true` after the dialog's `onAnimationEnd` or via a short `setTimeout` in a `useEffect` keyed on `fullscreenWidget`, ensuring the dialog has finished its enter animation before NVL initializes.

### AD-3: Context menu z-index already correct

The `NodeContextMenu` already uses `createPortal(_, document.body)` with `z-[500]`, which is above the Radix Dialog overlay at `z-50`. No changes needed for context menu portaling.

---

## Affected Files

| # | File | Package | Change |
|---|------|---------|--------|
| 1 | `component/src/charts/graph-chart.tsx` | component/ | Add `autoFit?: boolean` prop. When true, run `fit()` after a `requestAnimationFrame` + 150ms delay on mount. |
| 2 | `app/src/components/dashboard-container.tsx` | app/ | (a) Add `key` to fullscreen `CardContainer` to force remount. (b) Add `isFullscreenReady` state with delayed mount pattern. |
| 3 | `app/src/components/graph-exploration-wrapper.tsx` | app/ | Accept and forward `autoFit` prop to `GraphChart`. |
| 4 | `app/src/components/chart-renderer.tsx` | app/ | Pass `autoFit` prop through to `GraphExplorationWrapper` and standalone `GraphChart`. |
| 5 | `app/src/components/card-container.tsx` | app/ | Accept optional `autoFit?: boolean` prop, pass through to `ChartRenderer`. |
| 6 | `component/src/charts/__tests__/graph-chart.test.tsx` | component/ | Add unit tests for `autoFit` prop. |
| 7 | `app/e2e/charts.spec.ts` | app/ | Enhance existing fullscreen E2E test to verify graph fits correctly. |

---

## Investigation Findings

### How fullscreen currently renders

`dashboard-container.tsx` lines 235-253:
```tsx
<Dialog open={fullscreenWidget !== null} onOpenChange={...}>
  <DialogContent className="sm:max-w-[90vw] h-[85vh] flex flex-col">
    {fullscreenWidget && (
      <>
        <h2 ...>{title}</h2>
        <div className="flex-1 min-h-0">
          <CardContainer widget={fullscreenWidget} ... />
        </div>
      </>
    )}
  </DialogContent>
</Dialog>
```

The `CardContainer` is rendered conditionally when `fullscreenWidget` is non-null. The `DialogContent` has CSS animations (`animate-in`, `zoom-in-95`, `fade-in-0`). During these animations (duration-200 = 200ms), the container dimensions may not be final.

### How NVL initializes

1. `InteractiveNvlWrapper` uses a `containerRef` and calls `new NVL(containerRef.current, ...)` in a `useEffect`.
2. NVL constructor calls `fitCanvasSizeToParent` which reads `parentElement.clientWidth/Height`.
3. The `onLayoutDone` callback fires `fitGraph()` which calls `nvlRef.current.fit(nodeIds)`.
4. `fit()` updates pan/zoom but does NOT re-measure the canvas size.

### Why the current code breaks

The `CardContainer` in the fullscreen dialog is rendered simultaneously with the dialog's open animation. NVL mounts and reads container size while the dialog is still at 95% scale (zoom-in-95 animation). The canvas pixel buffer is set to ~95% of the final size. After animation completes, the graph appears zoomed/offset incorrectly, and hit-testing coordinates are off by ~5%.

### Context menu portal

`NodeContextMenu` (line 80-108 of `graph-exploration-wrapper.tsx`) uses `createPortal(_, document.body)` with `z-[500]`. The Radix DialogOverlay is at `z-50`. This is correct and doesn't need changes.

---

## Detailed Implementation Steps (TDD)

### Step 1: Unit Test — `autoFit` prop triggers fit after mount (RED)

**File:** `component/src/charts/__tests__/graph-chart.test.tsx`

Add the following tests to the existing describe block:

```typescript
// --- autoFit ---

it("calls fit on mount when autoFit is true", async () => {
  const mockFit = vi.fn();
  // The NVL mock needs to expose a ref with fit()
  // InteractiveNvlWrapper mock already captures props; we need to also
  // wire the ref. Update the mock to call the ref callback.
  render(
    <GraphChart nodes={sampleNodes} edges={sampleEdges} autoFit />
  );
  // Wait for the delayed fit to fire
  await vi.advanceTimersByTimeAsync(200);
  // Verify fit was called (via the nvlCallbacks.onLayoutDone or directly)
});

it("does not call extra fit on mount when autoFit is false or absent", () => {
  render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
  // The only fit call should be from onLayoutDone, not an extra delayed one
});
```

**Challenge:** The existing NVL mock replaces `InteractiveNvlWrapper` with a simple div. To test `autoFit`, we need to verify that `fitGraph()` is called after a delay. Since the mock doesn't expose the NVL ref, we'll test this by:

1. Using `vi.useFakeTimers()` in the test.
2. Spying on `requestAnimationFrame` and verifying it was called.
3. Alternatively: add a `data-testid="auto-fit-pending"` attribute while the delayed fit is in progress, and remove it after. This is testable.

**Practical approach:** Since `fitGraph()` calls `nvlRef.current.fit()` and the mock captures all props, we can verify via the `nvlCallbacks` that `onLayoutDone` is set, and additionally test that the `autoFit` effect triggers. The most pragmatic test: verify that the `InteractiveNvlWrapper` mock receives the expected props and that the component renders without error when `autoFit={true}`.

### Step 2: Implement `autoFit` in GraphChart (GREEN)

**File:** `component/src/charts/graph-chart.tsx`

**Exact changes:**

Line 51 — Add to `GraphChartProps` interface:
```typescript
/** When true, triggers a fit-to-viewport after mount with a short delay.
 *  Useful when the container size may change after initial render (e.g. dialogs). */
autoFit?: boolean;
```

Line 231 — Add `autoFit` to destructured props:
```typescript
export function GraphChart({
  // ... existing props ...
  autoFit,
  className,
}: GraphChartProps) {
```

After line 308 (after the `fitGraph` callback definition), add:
```typescript
// When autoFit is true, trigger a delayed fit after mount to handle
// containers that animate to their final size (e.g. fullscreen dialogs).
useEffect(() => {
  if (!autoFit) return;
  const raf = requestAnimationFrame(() => {
    const timer = setTimeout(() => {
      fitGraph();
    }, 150);
    // Store for cleanup
    cleanupRef.current = () => clearTimeout(timer);
  });
  return () => {
    cancelAnimationFrame(raf);
    cleanupRef.current?.();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [autoFit]);
```

This needs a `cleanupRef`:
```typescript
const cleanupRef = useRef<(() => void) | null>(null);
```

Add this near the other refs (after line 250).

### Step 3: Update unit tests to pass (GREEN)

**File:** `component/src/charts/__tests__/graph-chart.test.tsx`

Add tests (see Step 1 above), using `vi.useFakeTimers()` to control timing:

```typescript
describe("autoFit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders without error when autoFit is true", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} autoFit />);
    expect(screen.getByTestId("nvl-wrapper")).toBeInTheDocument();
  });

  it("renders without error when autoFit is false", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} autoFit={false} />);
    expect(screen.getByTestId("nvl-wrapper")).toBeInTheDocument();
  });
});
```

Note: Since the NVL mock doesn't expose a real ref, we can't directly test that `fit()` was called. The delayed fit effect runs in the real component but is a no-op with the mock (nvlRef.current is null because the mock doesn't forward refs). The real behavior is verified by E2E tests.

### Step 4: Forward `autoFit` through the app/ rendering chain

**File:** `app/src/components/card-container.tsx`

Add `autoFit?: boolean` to `CardContainerProps` interface (line 28):
```typescript
interface CardContainerProps {
  // ... existing props ...
  /** When true, graph widgets will trigger a fit-to-viewport after mount. */
  autoFit?: boolean;
}
```

Destructure it (line 70):
```typescript
export function CardContainer({
  // ... existing props ...
  autoFit,
}: CardContainerProps) {
```

Pass through to `ChartRenderer` calls. There are 4 `ChartRenderer` usages in the file. Add `autoFit={autoFit}` to all of them. The prop only affects graph chart type, so it's safely ignored by others.

**File:** `app/src/components/chart-renderer.tsx`

Add `autoFit?: boolean` to `ChartRendererProps` interface (line 68):
```typescript
export interface ChartRendererProps {
  // ... existing props ...
  /** When true, graph widgets trigger a fit after mount. */
  autoFit?: boolean;
}
```

Destructure it (line 89):
```typescript
export function ChartRenderer({ ..., autoFit }: ChartRendererProps) {
```

In the `case "graph"` switch branch (line 176-203), pass `autoFit` to both `GraphExplorationWrapper` and `GraphChart`:

Line 183:
```typescript
<GraphExplorationWrapper
  widgetId={widgetId ?? connectionId}
  nodes={graphData.nodes ?? []}
  edges={graphData.edges ?? []}
  connectionId={connectionId}
  settings={settings}
  onChartClick={onChartClick}
  resultId={resultId}
  autoFit={autoFit}
/>
```

Line 195:
```typescript
<GraphChart
  nodes={graphData.nodes ?? []}
  edges={graphData.edges ?? []}
  layout={settings.layout as "force" | "circular" | undefined}
  showLabels={settings.showLabels as boolean | undefined}
  onNodeSelect={...}
  autoFit={autoFit}
/>
```

**File:** `app/src/components/graph-exploration-wrapper.tsx`

Add `autoFit?: boolean` to `GraphExplorationWrapperProps` (line 26):
```typescript
interface GraphExplorationWrapperProps {
  // ... existing props ...
  /** Forward to GraphChart to trigger fit-to-viewport after mount. */
  autoFit?: boolean;
}
```

Destructure it (line 131):
```typescript
export function GraphExplorationWrapper({
  // ... existing props ...
  autoFit,
}: GraphExplorationWrapperProps) {
```

Pass it to `<GraphChart>` (line 213):
```tsx
<GraphChart
  // ... existing props ...
  autoFit={autoFit}
/>
```

### Step 5: Fix fullscreen dialog mounting in DashboardContainer

**File:** `app/src/components/dashboard-container.tsx`

**Change 1:** Add `key` prop to force remount and `autoFit` prop.

Replace lines 241-252:
```tsx
<DialogContent className="sm:max-w-[90vw] h-[85vh] flex flex-col">
  {fullscreenWidget && (
    <>
      <h2 className="text-lg font-semibold mb-2">
        {interpolateTitle(getWidgetTitle(fullscreenWidget), parameters)}
      </h2>
      <div className="flex-1 min-h-0">
        <CardContainer widget={fullscreenWidget} refetchInterval={refetchInterval} onNavigateToPage={onNavigateToPage} />
      </div>
    </>
  )}
</DialogContent>
```

With:
```tsx
<DialogContent className="sm:max-w-[90vw] h-[85vh] flex flex-col">
  {fullscreenWidget && (
    <>
      <h2 className="text-lg font-semibold mb-2">
        {interpolateTitle(getWidgetTitle(fullscreenWidget), parameters)}
      </h2>
      <div className="flex-1 min-h-0">
        <CardContainer
          key={`${fullscreenWidget.id}-fullscreen`}
          widget={fullscreenWidget}
          refetchInterval={refetchInterval}
          onNavigateToPage={onNavigateToPage}
          autoFit
        />
      </div>
    </>
  )}
</DialogContent>
```

The `key` ensures React creates a brand new `CardContainer` (and therefore a new NVL instance) each time fullscreen opens, so NVL's canvas initialization happens with the dialog's container. The `autoFit` prop triggers the delayed `fit()` call after the dialog animation settles.

### Step 6: Export `autoFit` from component package types

**File:** `component/src/charts/graph-chart.tsx` (already modified in Step 2)
**File:** `component/src/charts/index.ts` — No change needed; `GraphChartProps` is already exported.

### Step 7: E2E Test — Graph fullscreen renders correctly

**File:** `app/e2e/charts.spec.ts`

The existing test `"graph context menu appears above fullscreen dialog overlay"` (line 749) already tests fullscreen + context menu. Enhance it to also verify the graph fits the viewport:

After line 779 (`await expect(page.locator("[role='dialog']")).toBeVisible({ timeout: 5_000 });`), add:
```typescript
// Wait for the graph to finish fitting in fullscreen
await page.waitForTimeout(300); // autoFit delay (150ms) + buffer

// Verify the graph exploration wrapper is visible inside the dialog
const fullscreenExploration = page.locator("[role='dialog'] [data-testid='graph-exploration']");
await expect(fullscreenExploration).toBeVisible({ timeout: 5_000 });

// Verify the fit button is visible (proves graph toolbar rendered)
await expect(
  page.locator("[role='dialog']").getByRole("button", { name: "Fit graph" })
).toBeVisible({ timeout: 5_000 });

// Verify graph status bar is visible (proves NVL mounted with data)
await expect(
  page.locator("[role='dialog'] [data-testid='graph-status-bar']")
).toBeVisible({ timeout: 5_000 });
```

Additionally, add a **new dedicated test** for the fullscreen graph fit:

```typescript
test("graph chart — fullscreen dialog renders graph with correct viewport", async ({ page }) => {
  await addGraphWidget(page);

  // Save and navigate to view mode
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({ timeout: 10_000 });
  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

  // Wait for graph to render
  const exploration = page.locator("[data-testid='graph-exploration']");
  await expect(exploration).toBeVisible({ timeout: 15_000 });

  // Open fullscreen
  const widgetCard = exploration.locator("..").locator("..");
  await widgetCard.hover();
  const fullscreenBtn = page.getByRole("button", { name: /fullscreen/i }).first();
  await expect(fullscreenBtn).toBeVisible({ timeout: 2_000 });
  await fullscreenBtn.click();

  // Wait for dialog
  const dialog = page.locator("[role='dialog']");
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  // Wait for autoFit to complete
  await page.waitForTimeout(300);

  // Graph should be visible inside the dialog with data
  const fsExploration = dialog.locator("[data-testid='graph-exploration']");
  await expect(fsExploration).toBeVisible({ timeout: 5_000 });

  // Status bar should show node/edge counts (proves data rendered)
  const nodeCount = dialog.locator("[data-testid='graph-node-count']");
  await expect(nodeCount).toBeVisible({ timeout: 5_000 });
  const countText = await nodeCount.textContent();
  expect(countText).toMatch(/\d+ nodes/);

  // Toolbar should be functional
  const fitBtn = dialog.getByRole("button", { name: "Fit graph" });
  await expect(fitBtn).toBeVisible({ timeout: 5_000 });
  await fitBtn.click(); // Should not throw

  // Close and verify no errors
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Query Failed")).not.toBeVisible();
});
```

---

## Step-by-Step TDD Sequence

| # | Phase | Action | File(s) | Test Command |
|---|-------|--------|---------|-------------|
| 1 | RED | Write `autoFit` unit tests | `component/src/charts/__tests__/graph-chart.test.tsx` | `cd component && npm test -- graph-chart` |
| 2 | GREEN | Add `autoFit` prop + delayed fit effect | `component/src/charts/graph-chart.tsx` | `cd component && npm test -- graph-chart` |
| 3 | REFACTOR | Clean up effect, ensure cleanup is correct | `component/src/charts/graph-chart.tsx` | `cd component && npm test -- graph-chart` |
| 4 | GREEN | Forward `autoFit` through app/ chain | `card-container.tsx`, `chart-renderer.tsx`, `graph-exploration-wrapper.tsx` | `cd app && npx next lint --fix` |
| 5 | GREEN | Add key + autoFit to fullscreen dialog | `dashboard-container.tsx` | `cd app && npx next lint --fix` |
| 6 | RED | Write/enhance E2E fullscreen graph test | `app/e2e/charts.spec.ts` | `cd app && npx playwright test charts.spec.ts` |
| 7 | GREEN | Verify E2E passes | - | `cd app && npx playwright test charts.spec.ts` |
| 8 | VERIFY | Full build + lint | - | `npm run build && npm run lint` |

---

## Exact Lines to Change

### `component/src/charts/graph-chart.tsx`

| Line(s) | Current | New |
|---------|---------|-----|
| 51 (interface) | `className?: string;` | Add before `className`: `autoFit?: boolean;` |
| 231 (destructure) | `className,` | Add before `className`: `autoFit,` |
| After 250 | (nothing) | Add: `const cleanupRef = useRef<(() => void) \| null>(null);` |
| After 308 | (nothing) | Add: autoFit `useEffect` (see Step 2 above) |

### `app/src/components/dashboard-container.tsx`

| Line(s) | Current | New |
|---------|---------|-----|
| 248 | `<CardContainer widget={fullscreenWidget} refetchInterval={refetchInterval} onNavigateToPage={onNavigateToPage} />` | `<CardContainer key={\`${fullscreenWidget.id}-fullscreen\`} widget={fullscreenWidget} refetchInterval={refetchInterval} onNavigateToPage={onNavigateToPage} autoFit />` |

### `app/src/components/card-container.tsx`

| Line(s) | Current | New |
|---------|---------|-----|
| 28 (interface) | After `onNavigateToPage` | Add: `autoFit?: boolean;` |
| 70 (destructure) | After `onNavigateToPage,` | Add: `autoFit,` |
| All `<ChartRenderer>` calls | (no autoFit) | Add: `autoFit={autoFit}` |

### `app/src/components/chart-renderer.tsx`

| Line(s) | Current | New |
|---------|---------|-----|
| 68 (interface) | After `paramValues` | Add: `autoFit?: boolean;` |
| 89 (destructure) | After `paramValues` | Add: `autoFit` |
| 183 (`<GraphExplorationWrapper>`) | (no autoFit) | Add: `autoFit={autoFit}` |
| 195 (`<GraphChart>`) | (no autoFit) | Add: `autoFit={autoFit}` |

### `app/src/components/graph-exploration-wrapper.tsx`

| Line(s) | Current | New |
|---------|---------|-----|
| 26 (interface) | After `resultId` | Add: `autoFit?: boolean;` |
| 131 (destructure) | After `resultId,` | Add: `autoFit,` |
| 213 (`<GraphChart>`) | (no autoFit) | Add: `autoFit={autoFit}` |

---

## Security Checklist

- [x] **No query modification:** The `autoFit` prop triggers only a viewport fit (pan/zoom), not any data or query change.
- [x] **No credential exposure:** No new credential or secret handling.
- [x] **No XSS vectors:** No user input is interpolated into DOM; `autoFit` is a boolean prop.
- [x] **Tenant isolation:** Fullscreen rendering uses the same widget data already loaded for the dashboard. No cross-tenant data access.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| NVL canvas pixel buffer is set incorrectly despite delayed `fit()` | Low | Graph appears slightly misaligned in fullscreen | The `key` prop forces a fresh NVL instance, so construction happens with dialog at near-final size. The 150ms delay covers the 200ms animation. If needed, increase delay or add a second `fit()` at 300ms. |
| Double query execution in fullscreen | Low | Extra API call for the same widget data | TanStack Query's cache deduplicates identical queries. The fullscreen `CardContainer` reuses the same cache key. Verified: `useWidgetQuery` uses `queryHash` for dedup. |
| `requestAnimationFrame` not available in test env | Very Low | Unit tests fail | Already handled: the mock replaces `InteractiveNvlWrapper`, so the real NVL code doesn't run in tests. E2E uses a real browser. |
| autoFit fires before NVL ref is assigned | Low | `fitGraph()` is a no-op (nvlRef.current is null) | The `requestAnimationFrame` + 150ms delay should be sufficient. NVL initializes synchronously in the `useEffect` of `InteractiveNvlWrapper`. If still null, it's harmless (the `if (nvlRef.current)` guard in `fitGraph` prevents errors). |

---

## Migration Needed?

**No.** This is a pure client-side rendering fix. No database schema, API, or configuration changes.

---

## Testing Strategy

### Unit Tests (Vitest) — component/ package

| Test File | Test Cases |
|-----------|-----------|
| `graph-chart.test.tsx` | `autoFit={true}` renders without error; `autoFit={false}` renders without error; component mounts and unmounts cleanly with autoFit |

### E2E Tests (Playwright) — app/ package

| Test File | Test Cases |
|-----------|-----------|
| `charts.spec.ts` | New: "graph chart -- fullscreen dialog renders graph with correct viewport" -- opens fullscreen, verifies graph-exploration visible, status bar with counts, fit button works, close without errors |
| `charts.spec.ts` | Enhanced: "graph context menu appears above fullscreen dialog overlay" -- add assertions for graph toolbar and status bar visibility in fullscreen |

### Manual Verification

1. Create a graph widget with a Cypher query (e.g., `MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 50`).
2. Save the dashboard and go to view mode.
3. Click the fullscreen button on the graph widget.
4. Verify: Graph fills the fullscreen dialog, nodes are centered, toolbar (Fit/Layout) is visible.
5. Right-click on a node -- context menu should appear at the correct mouse position.
6. Hover over nodes -- tooltips/highlights should respond correctly.
7. Close fullscreen, reopen -- should work consistently.
