# Third-party notices

## World map GeoJSON — `component/src/charts/world.geo.json`

Used only by the choropleth chart (`component/src/charts/choropleth-chart.tsx`), which loads it with a dynamic import.

What is known about this file, established by inspection:

- It is in the legacy Apache ECharts world-map JSON format: 217 features in CRS84, whose properties are exactly `{ name, childNum }`.
- ECharts' bundled map data is derived from [Natural Earth](https://www.naturalearthdata.com/), which places its data in the public domain.
- It entered this repository in commit `fa663a79` ("feat(charts): add Circle Packing chart widget", #613) with no source recorded.
- It is **not** a copy of `echarts-countries-js`'s `world.js`; the coordinates do not match.

The upstream provenance is stated here as far as it can be verified from the file itself. No licence is asserted beyond that, because the original download was not recorded. Replacing this file with a freshly sourced Natural Earth 110m dataset carrying ISO 3166 codes is tracked with the choropleth `nameMap` work (#1402, #1543), which would settle the provenance definitively.

## Removed dependency — `echarts-countries-js`

Recorded for anyone auditing history: this package was declared as a runtime dependency of `component/` but never imported. It shipped 36 MB and declared `"license": "ISC"` in its `package.json` while its own `LICENSE.md` read "ODC Open Database License (ODbL)". It was removed rather than resolved, since no code depended on it.
