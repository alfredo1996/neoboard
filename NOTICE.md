# Third-party notices

## World map GeoJSON — `component/src/charts/world.geo.json`

Used only by the choropleth chart (`component/src/charts/choropleth-chart.tsx`), which loads it with a dynamic import.

**Provenance and licence: unknown.** The file entered this repository in commit `fa663a79` ("feat(charts): add Circle Packing chart widget", #613) with no source, licence or download record. Nothing here should be read as an assertion about either.

What can be observed about the file itself:

- It contains 217 features in CRS84, whose properties are exactly `{ name, childNum }`.
- That shape resembles the legacy Apache ECharts world-map JSON format. A resemblance in structure is not evidence of origin, and no upstream file has been matched to it byte-for-byte.
- It is **not** a copy of `echarts-countries-js`'s `world.js`; the coordinates do not match.

Because the origin is unrecorded, the correct fix is to replace this file with a dataset whose source and licence are known — for example a freshly downloaded Natural Earth 110m set carrying ISO 3166 codes, recorded here with its download URL and licence at the time of retrieval. That is tracked alongside the choropleth `nameMap` work (#1402, #1543). Until then this notice records the gap rather than papering over it.

## Removed dependency — `echarts-countries-js`

Recorded for anyone auditing history: this package was declared as a runtime dependency of `component/` but never imported. It shipped 36 MB and declared `"license": "ISC"` in its `package.json` while its own `LICENSE.md` read "ODC Open Database License (ODbL)". It was removed rather than reconciled, since no code depended on it.
