# Chart promotion table

One row per chart story under `stories/charts`, judged on the three gates of
#1688: it renders within its budget, it looks right in light and in dark, and
its honesty brief (the wave-2 per-chart work of the 2026-09-03 charts plan) is
done.

**Rule.** A chart is offered only when it passes all three gates. A chart that
fails any gate belongs in `DISABLED_CHART_TYPES`
(`app/src/lib/plugin/chart-helpers.ts`), with the reason here. The verdict
column applies that rule and nothing else; [Not applied yet](#not-applied-yet)
lists where the app does not match it.

Numbers are from `npm run bench:charts` on 2026-09-10 (Apple Silicon, headless
Chromium 1280×720). Rerun it after any chart change and update the row.

| Chart          | 1k ms | 10k ms | Speed                  | Light                                                                                           | Dark                                                                                  | Honesty brief                                                                | Verdict                                          |
| -------------- | ----: | -----: | ---------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| bar            |   102 |    422 | pass                   | pass                                                                                            | pass                                                                                  | n/a — no wave-2 brief; wave-1 seams landed (#1468, #1582, #1588, #1593)      | **offered**                                      |
| line           |   211 |    438 | pass                   | pass                                                                                            | pass                                                                                  | **fail** — W2-10/11/12 pending (#1417 open)                                  | **should be disabled** — honesty                 |
| pie            |   305 |   4957 | **fail** at 1k and 10k | **fail** — slice labels and leader lines overprint into a solid black band at 1k and 10k        | **fail** — the same band, in white                                                    | **fail** — W2-13 (fold past 6 slices / under 3 %) pending, no issue filed    | **should be disabled** — speed, look, honesty    |
| gauge          |    62 |     62 | pass                   | pass                                                                                            | pass                                                                                  | **fail** — W2-16 pending, no issue filed                                     | **should be disabled** — honesty                 |
| radar          |   105 |    644 | pass                   | **fail** — the legend (167 series at 1k, 1,667 at 10k) overprints the chart                     | **fail** — the same                                                                   | **fail** — W2-14 pending (#1406 open)                                        | **stays disabled** — look, honesty               |
| gantt          |    57 |     69 | pass                   | pass — a 15-task window behind a vertical zoom slider                                           | pass                                                                                  | pass — W2-04/05/06 merged (#1615, #1619, #1620); slider follow-up #1686      | **offered**                                      |
| sankey         |   248 |   1978 | **fail** at 10k        | **fail** — at 10k the 100 node labels a side overprint into a solid column                      | **fail** — the same; at 1k the labels carry a heavy halo                              | n/a — no wave-2 brief; duplicate-node fold landed (#1675)                    | **should be disabled** — speed, look             |
| sunburst       |   298 |   2617 | **fail** at 10k        | **fail** — leaf labels overprint into grey bands at 1k and a solid black ring at 10k            | **fail** — the same, the 10k ring solid white                                         | pass — W2-02 merged (#1601)                                                  | **should be disabled** — speed, look             |
| treemap        |   168 |    975 | pass                   | **fail** — only 3 groups get a fill (of 32 at 1k, of 100 at 10k); the other tiles stay unfilled | **fail** — the same                                                                   | pass — W2-02/03 merged (#1601, #1604)                                        | **stays disabled** — look; library only by #1687 |
| circle-packing |   103 |    288 | pass                   | pass — at 10k every group label truncates to "grou…"                                            | pass                                                                                  | superseded — W2-01/#1550 closed for #1687                                    | passes; **library only** by #1687                |
| choropleth     |    87 |    110 | pass                   | **fail** — repeated region names fill 4 regions at 1k and none at 10k; borders barely show      | **fail** — the same fills                                                             | **fail** — W2-19/20 pending (#1402 open)                                     | **stays disabled** — look, honesty               |
| map            |    39 |    211 | pass                   | pass — at 10k the markers are a solid block, which is the density                               | **fail** — the map container stays light grey when tiles do not load (related: #1685) | pass — W2-07/08/09 merged (#1617, #1621, #1623)                              | **should be disabled** — look (dark)             |
| graph          |   490 |   2213 | **fail** at 1k and 10k | pass at 1k — the settled layout is a dense hairball, which is the data                          | pass at 1k — the same                                                                 | n/a — no wave-2 brief                                                        | **should be disabled** — speed                   |
| single-value   |    14 |     14 | pass                   | pass — the tile sits small in its frame                                                         | pass                                                                                  | **fail** — W2-15 (fill the card, auto number format) pending, no issue filed | **should be disabled** — honesty                 |

Only bar and gantt pass all three gates.

**Speed.** Budgets are per chart, in
`src/charts/__tests__/fixtures/benchmark-report.ts`. Every chart still has the
issue's starting values, **300 ms at 1k and 1500 ms at 10k**; the issue says to
tune them after the first run, and that has not been done. The spec only
prints the numbers against them. This column is where they gate.

**Light and Dark.** Pass or fail against the taste doc
(`.claude/skills/design-review/skill.md`), following the design-reviewer steps
on the benchmark screenshots of 2026-09-10. Graph was judged at 1k from a
capture taken after its layout settled: the spec's own 1k shot is mid-layout,
and it takes none at 10k. These were judged by the agent applying the #1718
review fixes, not by a design-reviewer agent run. Run design-reviewer before
promoting any chart.

## Not applied yet

`DISABLED_CHART_TYPES` holds circle-packing, treemap, choropleth and radar. By
the rule above, eight charts the app still offers should join them: line, pie,
gauge, sankey, sunburst, map, graph and single-value. That is a product change
for the owner to make, or to answer with a different rule written here. It is
not part of the benchmark change. Until then, those eight are offered against
this table.

## What the number is

Time from the moment React starts rendering the story (a `performance.mark`
in the benchmark decorator, before the chart builds its option object) to the
second animation frame after the chart's `<canvas>` (ECharts, NVL), Leaflet
container or stat tile enters the DOM.

The benchmark story re-registers the two ECharts themes with animation and
progressive rendering off, so for every ECharts chart that frame is the whole
chart in its final state. Without that, the frame was not the whole chart.
Circle-packing at 10k had drawn 3,997 of its 22,799 canvas calls (reported
79 ms; the whole chart takes 288 ms), and sankey at 10k half of its calls
(679 ms; the whole chart takes 1978 ms). A gauge or sankey at 1k was the first
frame of its animation. In the app a series past 3000 items streams in
400-item chunks, so its first pixels appear sooner than this number.

NVL is not ECharts: its force layout keeps running after the timed frame
(about 12 s at 1k, longer at 10k), so graph's number is the first frame of an
unfinished layout.

The number includes the 10k-row transform, React commit, `init` + `setOption`
and the draw; it excludes bundle load and Storybook boot. Light and dark are
measured separately and the best of the two is reported: same work, two
samples.

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

This builds Storybook (`storybook build`), serves it with `vite preview` on
:6007, and mounts each `Charts/Benchmark` story in light and dark. Output goes
to `design-shots/benchmark/` (gitignored):

- one PNG per chart × rows × theme, except graph at 10k, whose layout outlasts
  any wait;
- `samples.jsonl`, appended as each sample is measured;
- `results.json` and the printed table, both from the global teardown
  (`e2e/benchmark-global-setup.ts`).

Samples live in the file rather than in the spec because a failed test
restarts Playwright's worker.

The run fails only on a chart that never paints within 60 s, or that throws
before its screenshot: a page error, a console error (aborted tile requests
excepted), Storybook's error screen or BaseChart's inline overlay. CI runs it
as its own job, `Chart Render Benchmark`.

The table's arithmetic (best of light and dark, rounding, per-chart budget) is
unit-tested in `src/charts/__tests__/benchmark-report.test.ts`. The benchmark
stories are tagged `!test`, so the vitest browser project (axe gate, #1677)
skips them.
