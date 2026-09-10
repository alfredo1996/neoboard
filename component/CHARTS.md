# Chart promotion table

One row per chart story under `stories/charts`, judged on the three gates of
#1688: does it render fast, does it look right in both themes, and is its
honesty brief (the wave-2 per-chart work of the 2026-09-03 charts plan) done.
Charts failing a gate stay in `DISABLED_CHART_TYPES`
(`app/src/lib/plugin/chart-helpers.ts`) with the reason here.

Numbers are from `npm run bench:charts` on 2026-09-10 (Apple Silicon, headless
Chromium 1280×720). Rerun it after any chart change and update the row.

| Chart          | 1k ms | 10k ms | Light/dark reviewed?                                                                         | Honesty brief done?                                                     | Verdict                                                                                    |
| -------------- | ----: | -----: | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| bar            |   108 |    420 | yes, 2026-09-10 — both fine; 10k categories is a solid block, as any bar chart would be      | n/a — no wave-2 brief; wave-1 seams landed (#1468, #1582, #1588, #1593) | **offered**                                                                                |
| line           |   210 |    428 | yes — both fine                                                                              | no — W2-10/11/12 pending (#1417 open)                                   | **offered**; honesty work still owed                                                       |
| pie            |   310 |   4821 | yes — 1k/10k slice labels overprint into a solid band in both themes                         | no — W2-13 (fold past 6 slices / under 3 %) pending                     | **offered**; over budget at both sizes — W2-13's fold is the fix, not speed                |
| gauge          |    62 |     64 | yes — both fine                                                                              | no — W2-16 pending                                                      | **offered**; reads `data[0]` only, so rows do not scale it                                 |
| radar          |   102 |    610 | yes — with 167+ series the legend swallows the chart in both themes                          | no — W2-14 pending (#1406 open)                                         | **stays disabled** (#1406; a legend per series past a dozen is unreadable)                 |
| gantt          |    57 |     70 | yes — both fine; paints a 15-task window behind a vertical zoom slider                       | yes — W2-04/05/06 merged (#1615, #1619, #1620); slider follow-up #1686  | **offered**                                                                                |
| sankey         |   109 |    679 | yes — both fine, 10k links is a dense but honest band                                        | n/a — no wave-2 brief; duplicate-node fold landed (#1675)               | **offered**                                                                                |
| sunburst       |   316 |   2689 | yes — 10k leaves turn the outer ring into a solid label mass (black on light, white on dark) | yes — W2-02 merged (#1601)                                              | **offered**; over budget at both sizes — label depth (`maxLabelDepth`) needs a default cap |
| treemap        |   176 |   1005 | yes — only 3 of 32 groups get a fill at 1k; the other tiles stay unfilled in both themes     | yes — W2-02/03 merged (#1601, #1604); the fill gap above is new         | **library only** — #1687 unregisters it from the app; fix the group fill before revisiting |
| circle-packing |   113 |     79 | yes — both fine; 10k leaves drawn as dots inside 100 group circles                           | superseded — W2-01/#1550 closed for #1687                               | **library only** — #1687 unregisters it from the app                                       |
| choropleth     |    85 |    136 | yes — repeated region names paint 4 regions at 1k and none at 10k, in both themes            | no — W2-19/20 pending (#1402 open)                                      | **stays disabled** (#1402 dark mode; unaggregated rows blank the map)                      |
| map            |    38 |    207 | yes — markers fine in both; container stays light grey in dark when no tiles load            | yes — W2-07/08/09 merged (#1617, #1621, #1623); tiles follow-up #1685   | **offered**                                                                                |
| graph          |   478 |   2141 | yes — both fine; NVL keeps laying out on the main thread ~70 s past first paint at 10k       | n/a — no wave-2 brief; NVL licence question deferred by the owner       | **offered**; over budget at both sizes — cap node count, 10k is beyond NVL without workers |
| single-value   |    14 |     13 | yes — both fine; the tile sits small in a 500 px frame                                       | no — W2-15 (fill the card, auto number format) pending                  | **offered**; rows do not apply, the count is the value shown                               |

Budgets: **300 ms at 1k, 1500 ms at 10k** — a printed report, not a gate,
until the numbers have settled. Over budget today: pie, sunburst, graph.

## What the number is

Time from the moment React starts rendering the story (a `performance.mark`
in the benchmark decorator, before the chart builds its option object) to the
second animation frame after the chart's `<canvas>` (ECharts, NVL), Leaflet
container or stat tile enters the DOM — the first frame with the chart on it
has been composited. It includes the 10k-row transform, React commit, ECharts
`init` + `setOption` and the first draw; it excludes bundle load and Storybook
boot. Light and dark are measured separately and the best of the two is
reported: same work, two samples.

The data is seeded (`src/charts/__tests__/fixtures/benchmark-data.ts`), one
shape per chart: flat rows for bar/line/pie/gauge/gantt/choropleth/map, links
over a bipartite node set for sankey, a two-level tree for
sunburst/treemap/circle-packing, series × indicator cells for radar, a ring
plus one chord per node for graph. Two charts cannot scale with rows: gauge
reads the first row, single-value shows the count as its value.

## Running it

```
npm run bench:charts
```

Builds Storybook (`storybook build`), serves it with `vite preview` on :6007,
mounts each `Charts/Benchmark` story in light and dark, prints the table and
writes `design-shots/benchmark/` (gitignored): one PNG per chart × rows × theme
plus `results.json`. Fails only on a chart that throws (page error, Storybook
error screen, BaseChart's inline overlay) or never paints within 60 s. CI runs
it in the unit-tests job after the story smoke tests.

The benchmark stories are tagged `!test`, so the vitest browser project (axe
gate, #1677) skips them.
