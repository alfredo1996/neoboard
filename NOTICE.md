# Third-party notices

## World map GeoJSON — `component/src/charts/world.geo.json`

Used only by the choropleth chart (`component/src/charts/choropleth-chart.tsx`), which loads it with a dynamic import.

**Source:** Natural Earth 110m Cultural Vectors, Admin 0 - Countries, as `ne_110m_admin_0_countries.geojson` from <https://github.com/nvkelso/natural-earth-vector> (`geojson/` directory, `master`), downloaded 2026-10-25 with the owner's approval (#2230).

**Licence:** public domain. Natural Earth states that its data is "in the public domain" and may be used without permission or attribution (<https://www.naturalearthdata.com/about/terms-of-use/>). Attribution is courteous, not required.

**Changes made here:** 200 features kept (838,726 bytes before, 176,727 after). Only `name` (Natural Earth `NAME`), `iso2` (`ISO_A2_EH`, falling back to `ISO_A2`), `iso3` (`ISO_A3_EH`, falling back to `ISO_A3`) and `long` (`NAME_LONG`, when it differs from `NAME`) are kept as properties, and coordinates are rounded to two decimals (about 1 km). Natural Earth marks the codes of France, Norway and Kosovo `-99` in `ISO_A2`/`ISO_A3`; the `_EH` fields carry the real ones. Northern Cyprus and Somaliland have no ISO code and match by name only.

This replaces an earlier file of unrecorded origin and licence (217 features, commit `fa663a79`, #613).

## Removed dependency — `echarts-countries-js`

Recorded for anyone auditing history: this package was declared as a runtime dependency of `component/` but never imported. It shipped 36 MB and declared `"license": "ISC"` in its `package.json` while its own `LICENSE.md` read "ODC Open Database License (ODbL)". It was removed rather than reconciled, since no code depended on it.
