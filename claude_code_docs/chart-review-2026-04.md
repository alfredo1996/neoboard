# Chart Styling Review — April 2026

Audit of gauge, sunburst, treemap, radar charts per #567.
Changes applied in the same PR.

---

## 1. Gauge

**File**: `component/src/charts/gauge-chart.tsx`

### Friction points (before)

| Issue | Location | Impact |
|-------|----------|--------|
| Hardcoded `#999` on axisTick, splitLine, axisLabel, anchor, title | lines 120-154 | Invisible on dark theme — text/ticks blend into dark backgrounds |
| Detail fontSize 28/18 too large at small sizes | detail.fontSize | Cramped, text overflows container |
| Anchor borderWidth 3px + `#999` looks dated | anchor.itemStyle | Heavy, draws attention away from the value |

### Changes applied

- **Colors**: All `#999` replaced with `"inherit"` (respects the ECharts theme's muted-foreground — `#657084` light, `#94a3b8` dark). Anchor uses `"auto"`.
- **Detail fontSize**: 28→24 (normal), 18→14 (compact). Reduces overflow at small container sizes.
- **Anchor**: borderWidth 3→2, size 12→10. Lighter, more modern feel.
- **Title fontSize**: 13→12. Slightly tighter to match the detail reduction.

### References

- [ECharts Gauge Speed](https://echarts.apache.org/examples/en/editor.html?c=gauge-speed) — clean needle, subtle ticks
- [Datawrapper Gauges](https://www.datawrapper.de/charts) — minimal axis, focus on the number

---

## 2. Sunburst

**File**: `component/src/charts/sunburst-chart.tsx`

### Friction points (before)

| Issue | Location | Impact |
|-------|----------|--------|
| Labels hidden by default (`show: false`), only appear on emphasis | label.show line 94 | User must hover to see any text — no static readability |
| Heavy shadow on emphasis (shadowBlur: 10, opacity 0.5) | emphasis.itemStyle | Visually distracting, especially with many segments |
| Inner radius 15% wastes center space | radius[0] | Less room for outer labels |

### Changes applied

- **Default labels**: `show: false` → `show: showLabels && !compact`. Level 1 labels now visible without hover.
- **Emphasis shadow**: shadowBlur 10→4, shadowColor opacity 0.5→0.15. Subtle highlight instead of a heavy glow.
- **Radius**: `["15%", "95%"]` → `["10%", "92%"]`. Smaller center hole gives more room for outer arcs and labels.

### References

- [ECharts Sunburst Drink](https://echarts.apache.org/examples/en/editor.html?c=sunburst-drink) — labels always visible on outer ring
- [Observable Plot Sunburst](https://observablehq.com/@d3/sunburst) — clean, minimal emphasis

---

## 3. Treemap

**File**: `component/src/charts/treemap-chart.tsx`

### Friction points (before)

| Issue | Location | Impact |
|-------|----------|--------|
| upperLabel height 30px wastes vertical space at small sizes | upperLabel.height | Breadcrumb header takes ~15% of a 200px widget |
| Hardcoded `#fff` border clashes with dark theme | itemStyle.borderColor | Bright white lines on dark backgrounds |
| Level 0 border `#555` also clashes | levels[0].borderColor | Not theme-aware |
| Level 1 borderWidth 2px is heavy for inner segments | levels[1].borderWidth | Adds visual noise in dense treemaps |

### Changes applied

- **upperLabel height**: 30→22. Also added `color: "inherit"` so header text respects theme.
- **Border color**: `#fff` → `rgba(128, 128, 128, 0.25)`. Neutral gray with low opacity works on both light and dark.
- **Level 0 border**: `#555` → `rgba(128, 128, 128, 0.4)`. Consistent with the global border approach.
- **Level 1 borderWidth**: 2→1. Less visual noise for nested rectangles.

### References

- [ECharts Treemap Disk Usage](https://echarts.apache.org/examples/en/editor.html?c=treemap-disk) — subtle borders, compact headers
- [Nivo Treemap](https://nivo.rocks/treemap/) — thin borders, responsive labels

---

## 4. Radar

**File**: `component/src/charts/radar-chart.tsx`

### Friction points (before)

| Issue | Location | Impact |
|-------|----------|--------|
| Fill opacity 0.3 makes overlapping series muddy | areaStyle.opacity | 2+ series become unreadable |
| No grid styling — bare lines, no alternating fills | radar config | Hard to read values against empty background |
| Emphasis lineStyle.width 3 barely distinguishable | emphasis | Hover feedback is weak |
| Axis name color defaults to ECharts black | axisName | Not theme-aware, invisible on dark mode |

### Changes applied

- **Fill opacity**: 0.3→0.15. Much cleaner when multiple series overlap — individual shapes remain distinguishable.
- **Grid styling**: Added `splitArea` with alternating subtle gray fills (`0.04` / `0.08` opacity) and softer `splitLine` color (`rgba(128,128,128,0.2)`). Gives the radar background depth without overwhelming the data.
- **Emphasis width**: 3→4. More noticeable hover feedback.
- **Axis name color**: Added `axisName: { color: "inherit" }`. Respects the theme's text color.
- **Radius**: `60%` → `65%`. Slightly larger to use more of the container.

### References

- [ECharts Radar Custom](https://echarts.apache.org/examples/en/editor.html?c=radar-custom) — soft grid fills, clean axis labels
- [Nivo Radar](https://nivo.rocks/radar/) — alternating background, low-opacity fills

---

## Summary of changes

| Chart | Lines changed | Key improvements |
|-------|--------------|-----------------|
| Gauge | 14 | Theme-aware colors, smaller detail text, lighter anchor |
| Sunburst | 4 | Labels visible by default, softer emphasis, tighter radius |
| Treemap | 8 | Smaller header, neutral borders for dark mode, thinner inner lines |
| Radar | 7 | Cleaner overlaps, grid readability, theme-aware axis names |

All changes are backwards-compatible — no new props or breaking API changes.
