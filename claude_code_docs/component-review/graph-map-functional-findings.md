# Graph + Map — deep functional review (2026-06-23)

Continuation of the component design review. After the per-chart design/a11y pass
(all 14 charts), this is a deep **functional** review of the two most complex
charts — `graph-chart.tsx` (NVL) and `map-chart.tsx` (Leaflet) — where remaining
bugs were most likely to hide. Branch: `fix/graph-map-functional-review` → `release/1.1`.

## 🔴 P1 — Map: pan/zoom resets + all markers rebuild on every parent re-render

**File:** `component/src/charts/map-chart.tsx`

The marker-build `useEffect` re-ran on **every** render because two of its
dependencies got a fresh identity each render:

- the plugin passes an **inline `onMarkerClick` arrow** (`app/src/plugins/map/component.tsx`),
- `fitBoundsPadding` **defaulted to an inline `[20, 20]` literal** (new array per render).

Each re-run tore down the marker `LayerGroup`, rebuilt every `circleMarker`, **and
called `map.fitBounds(...)`** — snapping the user's pan/zoom back to the data bounds.
`autoFitBounds` defaults to `true` in the map plugin, so this was the live path: any
unrelated re-render (parameter change, auto-refresh poll, hover state) yanked the map
back to fit-bounds and rebuilt all markers.

**Fix:**
- Latest-ref the click handler (`onMarkerClickRef`) and always bind the marker click
  through the ref — `onMarkerClick` is no longer an effect dependency.
- Hoist the padding default to a module constant `DEFAULT_FIT_PADDING` (stable identity).
- **Split** auto-fit into its own effect keyed on `[markers, autoFitBounds, fitBoundsPadding]`
  only, so rebuilding markers (for a style/handler change) never re-fits. Re-fitting now
  happens only when the markers themselves change → user pan/zoom is preserved.

**Tests (jsdom, mocked Leaflet):** does-not-re-fit-on-rerender, does-not-rebuild-markers
on handler-identity change, still-re-fits when markers actually change, invokes the
latest handler after a re-render without rebuilding. (+4)

## 🟠 P2 — Graph: `selectedNodeIds` had no visual effect

**File:** `component/src/charts/graph-chart.tsx`

`graph-exploration-wrapper.tsx` passes `selectedNodeIds={exploration.selectedNodeIds}`
and the click handler toggles it, but `toNvlNode` never mapped it to NVL's `selected`
field (`GraphElement.selected`, fully supported by NVL). So controlled selection was
**one-way-out only** — a restored or programmatic selection never highlighted the node;
only NVL's transient in-canvas click highlight showed.

**Fix:** build a `Set` from `selectedNodeIds` and set `selected: selectedIds.has(node.id)`
in `toNvlNode`; add `selectedIds` to the `nvlNodes` memo deps.

**No reshuffle risk:** `BasicNvlWrapper` diffs node attributes and calls
`addAndUpdateElementsInGraph` for just the changed nodes, so toggling `selected` updates
incrementally **without** re-running the force layout or resetting positions.

**Tests:** marks selected node, leaves others unselected, omitted prop → all unselected,
updated prop reflects on re-render. (+3)

## ⚪ Verified — NOT bugs (left as-is)

- **Raw `popup` HTML binding** (`bindPopup(m.popup)` without escaping) is a trusted
  public-API choice (stories pass HTML). The app's `transformToMapData` never sets
  `popup`; the data-driven `properties` tooltip path **is** escaped via `escapeHtml`.
  No app XSS path.
- Standard graph toolbar/zoom/layout/caption wiring, division-by-zero guards, and the
  empty/loading/error states were all reviewed and are correct.

## Verification

- `component` unit suite: **1474 pass** (+7 new); `tsc --noEmit` clean; `npm run lint` 0 errors.
- E2E: targeted `charts`, `heavy-widgets`, `widget-states`, `styling-rules` (graph + map).
