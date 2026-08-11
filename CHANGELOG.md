# Changelog

All notable changes to NeoBoard are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

NeoBoard versioning resets at **1.0.0** to mark the first public release. The 2.0.0 entry below documents the pre-public development cycle and is kept for historical reference.

> **On versions and tags.** No 1.x version has been git-tagged yet and `main` has not received a release —
> the dates below are the dates each release branch was consolidated into `dev`. Cutting the first tagged
> release is tracked in #1216.

## [Unreleased] — v1.5 in progress

Chart-experience release: chart authoring, editing, rule-based styling and click actions. Merged on `release/1.5` so far:

### Fixed

- The connection URI is no longer treated as a non-secret string. Three related gaps, none of them a live leak today but each one load-bearing if the next changes: the SDK interpolated the whole URI into its parse-failure message (`Invalid URI format: unable to parse "postgresql://admin:s3cr3t@…"`), which made `redactString` on the API boundary the single thing standing between a password and a response body — it now reports the expected shape and never the input; a password embedded in the URI was silently accepted and ignored by both connectors while still sitting in a plaintext `type: "text"` input, the in-memory module cache key and any error quoting the URI — now rejected at the write boundary, server-side, with the client validator mirroring the message; and `message.split(":")[0]`, an idiom the sibling module documents as broken-and-fixed because a colonless message comes back whole, was still live in two places and is replaced by `err.code ?? err.name`, with a ratchet so it cannot return. A bare username (`postgres://user@host/db`) is deliberately still accepted: it is a standard documented form and is not a secret. Also deletes a test that passed for every possible outcome — `expect(...).toBe(false)` inside a `try` whose `catch` asserted only `toBeDefined()` (#1303)
- A table whose saved `groupBy` was an **array** rendered completely flat — no group rows, no aggregates, no error — so individual rows read as group totals, a wrong answer with nothing to suggest anything had been dropped. Three seeded Chart Reference tiles holding `groupBy: ["region"]` were pixel-identical to the ungrouped tile. `parseGroupByColumns` accepted only a comma-separated string and its `typeof groupBy === "string" ? groupBy : ""` guard turned any array into an empty string. Note the shape of the bug is the opposite of what it looks like: the widget editor emits `vals.join(",")`, so configuring grouping through the UI always worked — the array reaches storage from seeded layouts, imported dashboards and NeoDash conversions. Both forms are now accepted, order preserved as the nesting hierarchy (#1395)
- A parameter widget's **Default value** was never applied, so every dashboard relying on defaults rendered empty on arrival. `extractParamDefaults` walked the layout correctly, had its own unit test, and had **zero production callers** — the editor's field wrote a value into the saved layout that was read only by a test. The seeded Chart Playground carries 21 configured defaults across 8 pages and showed `Waiting for parameters… $param_cat_dimension $param_cat_metric …` on every chart until the user set each knob by hand. Defaults are now seeded on load, filling only parameters that are not already set — which gives the precedence `URL > restored session > default` without any ordering machinery, since both of those are applied before the layout finishes loading. A once-per-dashboard guard stops a cleared parameter snapping straight back. This was the third instance of the same shape after #1234 and #1388, so a guard now asserts this helper has a production caller; the general form, a dead-export check across `lib/`, is #1477 (#1421)
- Every dashboard page you had ever visited kept auto-refreshing, forever, so query load scaled with browsing history rather than with what was on screen. Measured on Chart Reference sitting on the same page with the same 18 visible widgets: 16 `/api/query` POSTs in 40s having opened only page 1, against 77 after touring six pages and returning — **4.81x the database traffic for an identical view**, ~68 hidden widgets polling for pages nobody was looking at. Tour all 20 pages and leave the tab open and roughly 230 widgets keep polling. All of it is refresh-tier work against the customer's database, which is exactly the load the query scheduler exists to shed, so one user exploring a large dashboard could crowd out interactive queries for everyone on that connector. `isActive` was already computed and already used to hide the page and to gate `onLayoutChange` — it just never gated the refresh. Visited pages still stay mounted, so tab switching remains instant and does not re-query; they simply stop polling while hidden (#1419)
- Two options were advertised in the widget editor, implemented in the component library, and silently discarded in between: `trendEnabled` (single-value) and `thresholdZones` (gauge). Setting either did nothing, with no error, and the seeded reference dashboard shipped tiles demonstrating both — the `thresholdZones (3 bands)` tile was pixel-identical to `default`. The cause was not the Zod schema, which uses `.passthrough()` and preserved the keys intact; it was the plugin's explicit prop mapping, which never passed them to the chart. The worse half was the KPI: `transformToValueData` took the first column **positionally**, so following the editor's own "requires 2 rows" instruction on a `label, value` query rendered the date as the headline metric — `$2026-03`. It now picks the first numeric column and carries the previous row so a trend can be computed. A ratchet asserts that every option offered for a chart type is actually read by its plugin; it found the same bug in five more plugins, allowlisted and tracked in #1472 (#1397)
- A long-format result — `category, series, value`, what `GROUP BY a, b` naturally produces — rendered a bar or line chart that looked plausible and was wrong. `resolveValueKeys` treats every non-label column as a value series, so the `series` column became a series of its own whose cells all coerced to null: 12 bars with duplicated x labels, a ghost legend swatch with no bars, and **no stacking at all** despite `stackMode` being set. Line was worse — a single revenue line drawn across duplicated x values, interleaving delivered -> shipped -> delivered, which reads as a violently spiky time series but is pure artifact. Nothing marked either as an error, and the seeded reference dashboard itself demonstrated two `stackMode` options with this exact query shape, which is how easy it is to fall into. Bar and line now reject a result whose plotted value columns contain no numeric values, naming the offending column and showing the pivot that fixes it. A column that is entirely null stays legal — that is a sparse series, what a LEFT JOIN produces. `validate` now receives the same column mapping as the transform, so a result whose text columns the user already mapped away is not wrongly rejected. The 11 affected reference tiles are rewritten to wide format, so the stacking options finally demonstrate stacking (#1400)
- `numberFormat: "percent"` appended a `%` sign and scaled nothing, so a KPI computing `401 / 2000` rendered **`0.2%`** where the true share was **`20.05%`** — wrong by a factor of 100, rendered cleanly, with nothing in the UI to distinguish it from a real value. `0.2%` and `20.05%` are both believable share figures. The convention was never stated anywhere and the two option surfaces documented **opposite** contracts: the table's option was labelled `Percent (12%)`, asserting input was already 0–100, while the seeded reference tile was authored with ratio semantics — the clearest evidence the contract was not discoverable. `percent` now takes a **ratio** and scales it, via `Intl.NumberFormat`'s own `style: "percent"`, which also brings locale grouping (`12.5` → `1,250%`) that the hand-rolled branch never had. With no explicit decimal places it caps at 2 rather than Intl's default of 0, since rounding `20.05%` to `20%` is the same class of silent precision loss. **Breaking** for anyone who worked around the old behaviour by pre-multiplying by 100 in their query. Both option descriptions, both option labels, the single-value docs page and the demo tile now state the expected input range (#1396)
- A client-side `groupBy` reported `count` as the number of **rows** in the group while `sum`, `avg`, `min` and `max` all skipped nulls, so the three contradicted each other: a group of `[100, 200, null]` returned `count: 3, sum: 300, avg: 150`, and `sum / count` came to 100. A reader saw "3 revenue values totalling 300" with no way to know only two rows had revenue at all — and because `count` is typically the denominator someone divides by, the error propagated into everything derived from it. Nulls in an aggregated column are not an edge case; they are what a `LEFT JOIN` produces. `count` now counts non-null values, matching SQL's `COUNT(col)` — the output key is `revenue_count`, named for the column, so the column form is the only one it could have meant. The existing test used sample data with no nulls and passed on both the wrong and the right behaviour; the new invariant test (`sum / count === avg` for every group) fails on the old code and cannot be silently re-broken (#1414)
- Overlays ignored `prefers-reduced-motion`. All ten Radix primitives (dialog, alert-dialog, sheet, popover, tooltip, toast, select, dropdown-menu, context-menu, navigation-menu) animated unconditionally, even though spinner, progress and skeleton had honoured the preference since the component audit. Per-component `motion-reduce:animate-none` cannot fix this: the overlays animate through data-attribute variants like `data-[state=open]:animate-in`, which compile to `.class[data-state=open]` — specificity (0,2,0) — while the `motion-reduce:` utility is (0,1,0) and a media query adds no specificity, so the guard loses the cascade. The reset now lives once in `design-tokens.css`, the only stylesheet both packages import. It also fixed a CI flake nobody had connected to accessibility: Radix keeps an overlay mounted until its exit animation reports `animationend`, and when an NVL/WebGL widget mounted alongside the close that animation stalled, leaving `data-state="closed"` dialogs visible past a 5s budget — every "flaky graph chart" failure on `dev` was this, never a graph assertion. The E2E suite now runs as a reduced-motion user, so the accessibility branch is exercised in CI rather than merely declared (#1458)
- The "Sync to URL" toggle on a parameter-select widget did nothing. `buildUrlParams()` was called with no exclude set and `extractNoSyncParams()` — the helper written to supply one — had **zero production callers**, only its own unit tests. Switching the toggle off still put the value in the address bar. URL sync is now **opt-in**: only a parameter whose widget sets `syncToUrl: true` reaches the query string. **Breaking for shared links** — a URL carrying `?param_…` for a widget that never opted in will no longer reproduce those values, and the parameter is stripped from an inbound URL rather than silently ignored (#1388)
- Leaflet's zoom-transition timer fired after the map was torn down, throwing `Cannot read properties of undefined (reading '_leaflet_pos')`. Four such unhandled errors made the entire Storybook browser project exit 1 even though every story passed, which is why the visual-regression gate could only be pointed at two files. The timer is now disarmed before teardown, so `test:visual` runs the whole project (#1384)
- Connection reassignment was invisible to the optimistic lock: the update wrote `layoutJson` but never bumped `version`/`updatedAt`, so a browser with the editor open still held a matching version and its next save silently **reverted** the reassignment (#1376)
- The import's "N widgets imported without a connection" count included markdown and iframe widgets, which are exported with an empty `connectionId` by design — so a correctly mapped import containing three text widgets reported three unassigned widgets (#1377)
- Saving a dashboard on a window narrower than ~1500px permanently squashed its layout toward a single column. One layout is stored per page, but the grid was handed that layout with four different column counts (lg:12, md:10, sm:6, xs:4); below `lg` it clamped every item into the narrower count and the drag handler persisted the clamped result as _the_ layout. Each save ratcheted it further, irreversibly. The grid now scales instead of reflowing (#1375)
- Every dialog animated in from the bottom-right. `zoom-in-95` alone leaves tailwindcss-animate's `from`-only keyframe at `translate3d(0,0,0)`, which overrides the `translate(-50%,-50%)` centring, so the box interpolated from a corner. Measured at **212.5px** off-centre at the first frame (584px for a full-size dialog); now invariant to float rounding. This is the third report of the same drift (#1373, after #1155 and `d723a127`)
- Graph widgets re-ran their force layout and reshuffled on every scroll. Off-screen graphs were unmounted unconditionally to cap WebGL contexts, even with no context pressure — the Chart Reference graph page holds 8, half the browser ceiling. Unmounting is now gated on a live-graph budget (#1367)
- ⌘E no longer remounts the whole dashboard. View and edit were separate routes, so toggling tore down and re-queried every widget and lost the scroll position; the UI is hoisted into a shared layout segment, so nothing unmounts and both URLs still work (#1370)
- Leaving edit mode returned to the first page, discarding the page you were on. Saving while on a later page already did the same thing, independently (#1371)
- `neoboard status` reported a healthy app as `unhealthy (HTTP 307)` — it probed `/`, which correctly redirects to `/login` for an unauthenticated request, and accepted only `200`. It now probes `/api/health`, the same endpoint the container healthcheck uses (#1368)
- `neoboard status` always reported "1 containers". `docker compose ps --format json` emits a single line containing a JSON array, not one object per line, so the whole array parsed as one entry with empty fields (#1369)

### Changed

- `npm audit fix` applied, taking the dependency tree from **15 advisories (1 low, 4 moderate, 10 high) to 9 (4 moderate, 5 high)**. No `package.json` changed, but this is **not** a behaviour-free lockfile bump: `next` is declared `^16.2.12`, so the fix moved the framework itself to **16.3.0**. That changed the timing of Next's route announcer, which turned a known _intermittent_ E2E failure into a _deterministic_ one — `getByText("Editing:")` matches both the page heading and `#__next-route-announcer__`, a strict-mode collision across **41 assertions in 16 spec files**. Those selectors are now scoped to the heading, which the announcer's `role="alert"` div cannot match (#1465). The application itself was never affected. The nine remaining advisories collapse to two direct dependencies, `@neo4j-nvl/react` and `drizzle-kit`, and **neither has a forward fix**: both are already on the newest published version, and npm's "fix available" for each is a downgrade to an older major (NVL 1.2.1 → 1.0.0, drizzle-kit 0.31.10 → 0.18.1), so `npm audit fix --force` would regress rather than patch
- Docs site upgraded to astro 7.1.4 and starlight 0.41.5. Dependabot had split this into two PRs that could never pass — each broke the other's peer range — so they are replaced by one combined bump (#1461). Three breaking changes came with it: `social` takes an array of link items (starlight 0.33), autogenerated sidebar groups can no longer carry a `label` beside `autogenerate` (0.39), and content collections now require an explicit loader. That last one is worth knowing about: without it the `docs` collection resolves empty and `astro build` still **exits 0**, emitting a single 404 page while mentioning the empty collection only in passing. CI now fails the docs build when it emits fewer than 10 pages, because a green build was not evidence the site had any content — and with the site not yet deployed (#1318) an empty one would have gone unnoticed
- `zod` upgraded from 3.25.76 to 4.4.3. The tree previously held **two majors at once**: `component` declared `zod@^4.3.6` while importing it zero times, and that phantom dependency hoisted v4 to the root, forcing `app` to carry a nested v3. The unused declaration is removed, so there is now one zod. Migration was smaller than a 51-file footprint suggests — `.passthrough()` is unchanged and still preserves unknown keys, which matters because chart options depend on it (#1397). Three real changes: `ZodError.errors` is gone in favour of `.issues` (8 API routes, where leaving it would have turned a helpful 400 into a 500), `z.record()` now requires an explicit key type at the type level (11 sites), and `issue.path` widened to `PropertyKey[]` so it can contain symbols (#1436)
- `AlertDialog` now uses the same exact-centre animation as `Dialog`. It had kept upstream shadcn's `top-[48%]`, a deliberate 2%-of-height rise, so the two sibling modals animated differently and its centring classes carried no comment protecting them. Both now use `top-1/2` on both axes, and the geometry scrub is shared by both story files (#1373)
- `CLAUDE.md` moved to `.claude/CLAUDE.md`, alongside the hooks, skills and agents it belongs with, and out of the repo root where every visitor saw it. Claude Code reads both paths, so nothing changed about how it loads
- `npm run review:local` targets the active release branch instead of the previous one
- Vitest caps worker forks at 50% of available parallelism in `app` and `component`. The default is roughly one fork per core, and each fork loads jsdom + React + the component library, so on a many-core machine the suite ran out of headroom before it ran out of cores: workers began failing to boot with `Timeout waiting for worker to respond`, taking whole test files down with them. Measured on a 10-core machine, the `app` suite went from **889s with 96 failures and 9 files never collected** to **37s with 3480/3480 passing** — and a run that silently collects nine fewer files still prints a summary that looks complete, so the lost coverage was invisible. Expressed as a percentage rather than a fixed count so CI runners scale down with it (#1240)

### Added

- Bulk connector reassignment for a single dashboard, from the **Dashboard options** menu. Reassignment previously existed only as a connection-scoped operation that rewrote _every_ dashboard the caller could edit, reachable only from inside the delete-connection dialog (#1376)
- After an import that skipped a connection, the unassigned widgets can be fixed in one action instead of one widget editor at a time (#1377)

- A maximize toggle on the widget editor's query editor, doubling the editing width and giving 2.64× the height on open. Note the modal caps its body at `calc(90vh - 180px)`, so for an already-long query the gain is width plus moving the scroll into the editor rather than more height (#1374)

## [1.4.0] — 2026-07-29 — Audit, observability & correctness

An internal documentation audit cross-checked the repo's own claims against its code and found several that nobody had ever executed: features that were declared, exposed, and inert. This release makes them real, and fixes a set of correctness bugs that rendered cleanly and returned wrong answers. If you run NeoBoard, the items in **Added** and **Security** change what you can actually rely on.

### Added

- The audit trail now records. `auditLog()` previously had zero callers, so `GET /api/audit-logs` faithfully listed an empty table forever while the schema and the 25-action taxonomy made the feature look implemented. There are now 21 audit call sites covering connection create/update/delete/reassign, dashboard create/update/delete/share/share-revoke/import, user create/update/disable/password-reset/role change, API key create/revoke, encryption-key rotation, and SSO provider mutations. Rejected mutations write no entry, and secret-bearing routes record field names and a `secretRotated` flag rather than values (#1234, #1281)
- A test-time ratchet fails the build when a query against a tenant-scoped table omits its tenant filter (#1226). Read this precisely: it is a build-time safety net, **not** runtime enforcement. There is still no ORM-level or middleware-level tenant injection, and writing `eq(table.tenantId, session.tenantId)` per query in the route remains mandatory. The audit behind it walked 96 query sites across the 8 tenant-scoped tables and found no leak — 80 were explicitly scoped and all 16 unscoped sites were deliberately instance-wide (key rotation, first-admin gates)
- `neoboard db restore <file> [--clean] [--force]` — the half of backup the CLI never had. `db dump` existed with no counterpart, so the one procedure an admin runs while their instance is down was the least supported path in the product. Preconditions are runtime refusals rather than prose: an unreachable database refuses (the table listing doubles as the reachability probe, so "cannot read" can never be mistaken for "empty"), a non-empty target without `--clean` refuses and names the tables it found, and a running app refuses without `--force` (#1278)
- `neoboard doctor` now verifies that `ENCRYPTION_KEY` can actually decrypt what is stored, not just that it is 64 hex characters. A mismatched or regenerated key previously booted clean, passed `/api/health`, passed `doctor`, and then failed on every widget with Node's raw `Unsupported state or unable to authenticate data` — naming neither the key nor the fix (#1274)
- A drift guard test over the hand-maintained OpenAPI spec: every route file and exported HTTP method must appear in the spec, and every spec path must map to a real route. Opt-outs for internal routes are an explicit list, so they show up in the diff. Two missing GET operations were found and documented on the first run (#1236)
- `npm run verify`, `npm run sonar:local`, and `npm run review:local` — run the CI gate, a real SonarCloud branch scan, and the CodeRabbit review locally before pushing (#1253)
- A `design-reviewer` agent that captures Storybook in light and dark and judges appearance against the taste document, plus owners for two other previously unowned review checks (#1261)
- Released container images are now scanned for vulnerabilities, signed with cosign, shipped with an SBOM attestation, and built for `linux/arm64` as well as `linux/amd64` (#1224)
- `neoboard` installs generate and print an `ADMIN_BOOTSTRAP_TOKEN`. Without it a fresh `install.sh` produced a running instance nobody could ever log into — the first-admin signup form rejected every input (#1312)

### Changed

- **Breaking (component API):** the `cascading-select` parameter widget type is gone. Cascading selects were built on raw Radix `Select` and therefore had no type-to-search at all, which is the one thing a cascading select exists for. `CascadingSelector` is collapsed into `ParamSelector`, which gained optional `parentValue` / `parentParameterName`; cascading is now keyed on having a parent rather than on a widget type, and the Parent Parameter field moved into the Select editor. There is no back-compat shim (#1360)
- **Changed output:** PostgreSQL `int8` and `numeric` scalars now arrive as numbers and `interval` as text. Previously `SELECT count(*)` yielded the string `"42"` on PostgreSQL and the number `42` on Neo4j for the same logical query, and `numeric` scalars were strings while `numeric[]` elements were floats (#1307)
- **Changed output:** Neo4j integers outside ±2^53 are returned as strings rather than `bigint`, matching what the parser's own documentation already claimed (#1304)
- **Changed default:** chart percentages render to one decimal place, and pie labels, tooltips and donut centre values all route through the shared `formatNumber`. One dashboard previously showed `$45,231`, `2751` and `38.09%` side by side (#1248)
- Dark mode no longer composites low-alpha citrine over near-black, which read as brown or olive rather than amber. Selected sidebar rows and hover surfaces use a neutral dark selection surface, area fills use an in-hue gradient fade on both the styled and the default code paths, and the theme is now read reactively instead of being sampled once at chart mount (#1244, #1264, #1286)
- Widget cards reserve the subtitle line whether or not a subtitle is set, so charts in a row start their plot areas at the same height (#1246)
- All cartesian charts share one gridline treatment, and bar widgets keep their category labels in compact layouts instead of rendering unlabelled bars (#1247)
- In the graph widget, a plain click selects only that node instead of accumulating a selection — which had made the single-selection property inspector unreachable after the second click. Cmd/Ctrl+click toggles multi-selection (#1191)
- Graph widgets now mark APOC virtual nodes (negative element IDs) as explicitly unresolvable and decline to expand them, rather than offering an expansion that cannot succeed (#1361)
- Field-type and JSON-syntax colours moved off raw Tailwind palette classes onto tokens, an on-destructive foreground token was added for the toast close button, and a ratchet test guards against raw palette shades reappearing in token maps (#1249)

### Fixed

- Pie "Top N Slices" kept the first N rows in query order instead of the N largest. Unless you had also enabled the separate "Sort Slices by Value" toggle — which defaults to off — the chart silently collapsed the largest slice in your dataset into "Other" and rendered cleanly. This is a wrong answer a user would have believed (#1287)
- Neo4j integers above 2^53 failed `JSON.stringify` and returned an opaque `500 Query execution failed` for the _entire_ query. A single snowflake ID, epoch-nanosecond value, checksum or large `id()` lost the whole result set, with no indication which column caused it — and the same query worked in Neo4j Browser (#1304)
- Neo4j temporal values are now formatted with the driver's own lossless `toString()` instead of three hand-rolled branches. `LocalTime` rendered nanoseconds as if they were milliseconds — a 10^6 error affecting roughly one in ten times — `DateTime` dropped its timezone offset and all sub-second precision, and the unpadded `h:m:s` output broke lexicographic sort in table widgets. All three failed silently, showing a plausible wrong value (#1306)
- A single non-finite coordinate made Leaflet throw and replaced an entire map widget — 1,000 valid markers included — with "Chart failed to render". Non-finite markers are now dropped (#1288)
- The markdown widget's inline-emphasis passes ran over already-generated HTML and spliced `<em>` tags into `href`, `src` and `target` attributes; headings also carried no size class, so every heading rendered at 14px (#1290)
- Clearing a numeric parameter input wrote `0` instead of leaving the field blank, because `Number("")` is `0`, not `NaN`, so the `isNaN(Number(raw))` guard never fired for the one input that reaches it (#1292)
- Documentation accuracy pass. The docs site documented seven environment variables that exist nowhere in the code, invented CLI output, and made incorrect query-safety claims; `API_KEY_HMAC_SECRET` was missing from the Required Variables table, so an operator following the configuration page verbatim hit a boot failure (#1316). `CLAUDE.md` and `ARCHITECTURE.md` were corrected where they asserted behaviour the code does not have — a nonexistent `chart-registry` module, a nonexistent `--skip-migrations` flag, ORM-level tenant enforcement, and stale component counts (#1235, #1355)
- Operator runbooks corrected. The documented restore recipes failed against a non-empty database (no `--clean`, and an auto-migrating app that created the schema before `pg_restore` ran) and never warned that a backup taken before a key rotation becomes permanently undecryptable; the real migration escape hatch is `MIGRATE_ON_START=0` and appeared in no operator doc; and the key-rotation procedure told operators to send a session cookie as an `Authorization: Bearer` header, which returns 401 (#1219, #1222, #1277)
- `bash install.sh` — the README quick start — failed on every fresh clone, because `npm install --prefix` means the _global_ install location to npm and broke the postinstall `npm link` (#1309)
- The published `@neoboard/cli` could not run outside the monorepo: project-root detection threw, and the compose files were not packaged (#1315)
- `neoboard config set ports.app 4000` was honoured by doctor, the readiness probes, the generated `DATABASE_URL` and the banner URLs — but not by the actual port bindings, which stayed hardcoded (#1313)
- A missing `API_KEY_HMAC_SECRET` now fails fast with the generate command instead of crash-looping, and it is listed in the compose files, the Dockerfile, and both "Required env vars" headers (#1221)
- Connecting to a database on the host via `localhost` failed with the driver's `Could not perform discovery` error, which never mentions Docker. The error now explains that `localhost` is the container, and the loopback rewrite to `host.docker.internal` is skipped where that alias does not resolve, so Linux users keep the accurate `ECONNREFUSED` and the `--expose-host` hint (#1346, #1348)
- Test and CI hygiene: root-level `scripts/` and `eslint.config.js` changes no longer skip CI entirely, the E2E login helper no longer produces false timeout failures under load (21 in one local run, none of them a real defect), `auth.spec.ts` no longer fails deterministically when run alongside `auth-states.spec.ts`, the CLI integration workflow no longer hides a build failure behind `continue-on-error`, and Storybook no longer warns about a story glob matching nothing on every start (#1263, #1272, #1323, #1356, #1251)

### Security

- An explicit `?sslmode=require` in a PostgreSQL connection URI was parsed and discarded, so the connection was established **unencrypted** — with no error, no warning, and a green "Test Connection". `sslmode` is the only way to request TLS (the "Reject Unauthorized SSL" switch only affects certificate verification once TLS is already on), so there was no working way to demand encryption. `sslmode` is now honoured (#1299)
- The connection-module cache key omitted both the password and any tenant discriminator, so two connection rows in different tenants naming the same host, username and database collapsed onto one cached pool. A caller who knew the URI and username but not the password received a working, already-authenticated pool belonging to whoever cached it first. The key now includes the password and tenant (#1300)
- The login form's submit is gated on React hydration. Before hydration a click ran the browser's native form submit — a GET that put the email and plaintext password in the URL, and therefore in browser history and any access log (#1321)
- Any authenticated user could permanently wedge a connector's query scheduler by submitting a whitespace-only query: `runQuery` returned without invoking a terminal callback, so the slot never freed. After `maxConcurrent` such requests every subsequent query on that connection failed with 408/503 until the process restarted. The shared SDK helper now always settles the caller (#1301)
- Write queries buffered the entire result set into the Node heap before the row limit was applied, so `MAX_ROWS+1` bounded only what was _displayed_. One Form submit against a large table could exhaust the heap shared by every tenant on the process. Both connectors now drain writes through a cursor (#1298, #1326)
- Secrets are redacted at the pino logging boundary by default, at three install points covering the merged record, the message string and printf args, and the bare-Error path. Previously the always-on redaction covered five key names at one nesting level, and the URI-aware scrubber ran only under `LOG_ANONYMIZE=true`, which defaults to false. The audit found **no active credential leak** — all 33 `console.*` sites were reviewed and the connection package was already hardened — so this is defense in depth against a future call site, not a fix for a known exposure. Note that audit middleware still logs user-supplied query text verbatim; a secret embedded in a query literal reaches structured logs (#1227)
- `neoboard doctor`'s credential probe reported "no stored credentials yet" on every local-mode install because its SQL never survived the shell, silently disabling the check entirely. A check that reports "nothing to verify" when it is broken is worse than no check (#1352)

### Removed

- `app/tsconfig.tsbuildinfo` and `app/next-env.d.ts` are no longer tracked in git. Both are regenerated by every build, so `git add -A` swept them into unrelated PRs (#1241)
- The dead MDX story glob in the Storybook config (#1251)

## [1.3.0] — 2026-07-23 — Design system polish & hardening

Works through epics A–F of the v1.0 component-library audit, plus a round of ops/DX hardening and test-debt cleanup. The themes a user will notice: one consistent interactive colour, accessibility that holds up under keyboard navigation and dark mode, a tighter chart offering, and error messages that say what actually went wrong.

### Added

- Spinner, Progress, Toggle and ToggleGroup primitives, all honouring `prefers-reduced-motion`; existing loading buttons and overlays now share the one Spinner (#1129)
- `success` and `warning` variants on Button, and `secondary` / `tonal` / `success` / `warning` / `outline` on Alert, so Button, Badge and Alert share one variant vocabulary (#1126)
- A `size` scale (`sm` / `default` / `lg`) shared by Input, Textarea and Select triggers, plus a `FieldError` element for associating an error message with its control (#1127)
- Documented keyboard contracts for DataGrid, QueryEditor, Combobox and MultiSelect (#1128)
- Stories for six previously undocumented components, and "when to use / when not to" docs on every UI primitive; the README now states the `ui` vs `composed` tier rule (#1130)
- Visible keyboard-shortcut hints on the dashboard toolbar — ⌘E / ⌘S / ⌘⇧N on macOS, Ctrl equivalents elsewhere (#1156)
- Specific, sanitized failure messages for form writes: a missing required field now names the field instead of reporting "Write query execution failed" (#1162)
- Admin-only version, migration status and per-connection query-scheduler statistics in `GET /api/health`, so operators can confirm which build is live and whether migrations are current (#930)
- Column filters on the admin users table, so a specific user can be found without paging through the list (#1004)
- Reverse-proxy documentation with working nginx, Caddy, Traefik and cloud load-balancer configurations (#932)
- `neoboard demo` now seeds creator and reader accounts alongside admin and lists all three in the ready banner (#921)
- A Movie Highlights demo dashboard showing what a finished real-world Neo4j dashboard looks like — KPIs, live map, rule-based table styling and click-to-filter parameters (#1192)
- Multi-level sunburst examples in the demo showcases, replacing the single-level one (#1159)

### Changed

- Focus rings, links, tab indicators, selection highlights and tonal fills now render citrine amber in both themes, reversing the indigo accent introduced in 1.1.0. **Breaking for design-token consumers:** `--ring` and `--accent` change hue, and `--warning` shifts so it stays distinguishable from the interactive colour (#1125)
- Exactly one error red across the library. **Breaking:** dark-mode `destructive` buttons render as a light red surface with near-black text instead of dark red with white text, chosen for text legibility in both themes (#1126)
- **Breaking:** `size` on Input and Select triggers is now the shared design size scale; the native numeric `size` attribute is no longer accepted on Input (#1127)
- Circle packing, treemap, choropleth and radar no longer appear in the chart picker. Existing widgets using them keep rendering and keep showing their type when edited — only new selection is gated, so a fresh install offers 16 selectable chart types rather than 20 (#1158)
- The modal entrance animation changed from sliding up from the bottom to a scale-and-fade (#1155). This did not fully centre the entrance; see the note under Unreleased
- The Docker healthcheck start period is raised to 30s, and the Dockerfile's env documentation points at `.env.example` instead of duplicating it (#931)

### Fixed

- Graph widget nodes rendered invisible — node colours are now converted to hex for the NVL renderer (#1157)
- Dark-mode readability across charts and maps: bar and pie value labels, radar axis names, choropleth legend and region labels, graph relationship lines, and Leaflet attribution and disabled zoom controls (#1154)
- Number-range parameters render two knobs (min and max) instead of one (#1161)
- The chart-type list and other comboboxes scroll with the mouse wheel inside a dialog (#1160)
- Entering or leaving dashboard edit mode keeps the current scroll position instead of jumping to the top (#1163)
- Resizing the browser window in edit mode no longer marks the dashboard dirty or overwrites the saved layout with the narrow-column reflow; layout is persisted on drag and resize only (#1194)
- The widget editor's query placeholder follows the connection's language instead of keeping the Cypher example after a switch to SQL, and the preview Run button no longer shifts position when an error appears (#1193)
- Admin users list ordering is deterministic — without a sort tiebreaker, rows at a page boundary could appear on two pages or none (#1004)
- Tonal text contrast is locked to WCAG AA in both themes by a computed-contrast test, and 14 interactive elements that were missing a visible focus ring — widget drag handles, chart tiles, sidebar items, field-picker rows, graph toolbar controls and others — now have one (#1128)
- The signup page no longer flashes its form before registration status has loaded (#1168)
- The demo feedback form no longer fails on submit; the insert was omitting the NOT NULL `rating` column (#1164)
- `neoboard setup --mode local` no longer times out waiting for Postgres on hosts without the `pg_isready` client binary; readiness now uses a TCP probe (#1091)
- Seeded demo connections use the mode-correct database host, so data sources are reachable in Docker instead of being refused (#1152)
- Closed coverage gaps in the connection package — pool exhaustion, restart recovery, complex Neo4j schemas, concurrent writes and injection attempts — and split its test run into parallel and serial passes to remove container-contention flakes (#742)

### Security

- Form write failures return a message derived only from the error code and the offending column or constraint name; the raw driver message, SQL text and row data stay server-side, and query-structure errors deliberately stay generic (#1162)
- Deployment detail in `/api/health` — version, migration state, scheduler statistics — is gated behind an admin session and is never exposed on the unauthenticated probe surface (#930)

### Removed

- The `--danger` and `--danger-foreground` design tokens; `--destructive` is the single error red. **Breaking** for anything referencing them directly (#1126)

## [1.2.0] — 2026-07-01 — Connector SDK & plugin seam

Makes NeoBoard connectors buildable as external repositories. The stable connector contract is extracted into its own package, the four paths that were still hardcoded to the two built-in connectors now resolve through the plugin registry, and a reusable conformance harness lets a connector prove it honours NeoBoard's query-safety rules. **No new connectors ship in core** — MSSQL and MySQL are to ship as external repositories, outside this release. **For connector authors:** `@neoboard/connector-sdk` is versioned `0.1.0` and is **not published to npm**; it is an in-repo workspace package. Because nothing external consumes it yet, unused parts of its surface were deleted rather than deprecated — see Removed if you are already building against the in-repo package.

### Added

- `@neoboard/connector-sdk` (0.1.0), a new in-repo workspace package holding the stable connector contract: the `ConnectorPlugin` / `ConnectorRegistry` types, the `ConnectionModule` and `AuthenticationModule` base classes, `ConnectorError` plus its detection helpers, the shared config/result types, and the query-safety helpers. The built-in Neo4j and PostgreSQL connectors are refactored onto it, so the package is dogfooded rather than kept as a parallel copy of the types (#1117)
- Connection forms are generated from a connector's declared `formFields` — text, number, password, select and boolean fields, with required markers, descriptions and per-field errors — so a registry-supplied connector gets a working create-connection dialog with no core change. The edit dialog keeps its hand-written credential fields, which have bespoke "leave blank to keep existing" semantics (#1118)
- Connectors can supply their own schema introspection through an optional `createSchemaManager()` factory on the plugin, resolved by connector type through the registry. A connector that declares none resolves to nothing and simply has no schema panel (#1119)
- The query editor selects its language from the connector's declared `queryLanguage` rather than from its type (#1120)
- Registry-supplied connector types are accepted end to end through request validation and query execution, so adding a connector no longer requires a core code change per type (#1121)
- A framework-agnostic conformance harness, `buildConformanceCases()`, exported from the SDK. It returns cases any connector wires into its own test runner to prove that a write query is rejected under read-only access, that results are capped at the row limit and flagged as truncated, and that the configured timeout is honoured. Both built-in connectors run it against real databases (#1122)

### Changed

- `@neoboard/connection` now depends on the SDK and re-exports it, so its public API — including the `/connector-types` subpath — is unchanged for existing importers. Builds must run the SDK before `connection` and `app` (#1117)
- Built-in form-field definitions and query-language names are single-sourced in driver-free modules, exposed as `@neoboard/connection/form-fields` and `@neoboard/connection/query-languages` (#1118, #1120)
- The `connection.type` column changes from a PostgreSQL enum to `text` (migration `0011`) so a registry-supplied type can be stored. Existing values are preserved (#1121)
- `neoboard plugin list` still prints a fixed built-in connector list. This is deliberate: coupling the published CLI to the unpublished SDK would break global installs, and external connectors already list through `neoboard-connectors.json` (#1121)

### Fixed

- Neo4j graph property extraction no longer reads the driver's undocumented `record._fields` internal, which could break silently on a driver upgrade; it uses the public record API instead (#1116)
- An unrecognized connector type is no longer mislabeled as PostgreSQL during query execution — it resolves to an explicit unknown sentinel (#1121)
- The query editor and the widget-library and template-browser code previews no longer fall back to SQL or Cypher highlighting for a connector whose language they do not recognize; they render plain text. This also fixes a placeholder check that never matched, because it compared the connector type against a language name (#1120)

### Security

- Connector types are validated in the API layer now that `connection.type` is free-form text — the database column no longer constrains the accepted set (#1121)
- The read-only, row-limit and timeout invariants are now externally checkable, which is what stops a connector built outside core from quietly bypassing query safety. Cancellation is not covered: the `ConnectionModule` contract has no generic cancel API, so it cannot be verified generically (#1122)

### Removed

- The never-thrown `ConnectionError` / `QueryError` / `SchemaError` / `QueryTimeoutError` hierarchy and the empty `BaseAdvancedOptions` interface, both previously exported from `@neoboard/connection` (#1116)
- `ConnectorFormField.default`, which no renderer or validator read (#1118)
- The `CONNECTOR_LANGUAGES` display map, superseded by `CONNECTOR_QUERY_LANGUAGES` (#1120)
- The unused `registeredConnectorTypes()` helper; `isRegisteredConnectorType()` remains (#1121)
- The optional `assertNoLeak()` conformance hook, which no connector implemented (#1122)

## [1.1.0] — 2026-06-23 — Graphite & Citrine design system

NeoBoard's UI was, visually, thinly-reskinned shadcn defaults. This release replaces that with a deliberate design system — new colour palette, self-hosted typography, and real elevation, radius and motion scales — then dogfoods the whole app across seven review sessions (#895) and fixes everything those sessions turned up, from unreadable Postgres date columns to a single-line Markdown editor.

### Added

- Surface and elevation tokens — `--surface` / `--surface-2` for card and nested-panel backgrounds, `--border-strong` for input borders and dividers, `--accent-soft` for hover/active fills, and a warm-tinted `--shadow-sm/md/lg` scale (#820, #823)
- A radius scale — `--radius-sm` for controls, `--radius-md` for cards, `--radius-lg` for dialogs, `--radius-pill` for badges — instead of one 0.5rem corner everywhere (#831)
- Self-hosted Geist Sans (display) and Inter (body), exposed as `--font-display` / `--font-body`, with a heading scale (`text-display`, `text-h1`–`text-h3`) and tabular numerals on KPI values, chart axes and numeric table cells (#830)
- Motion vocabulary — easing and duration tokens, a subtle hover lift on interactive cards, and an animated skeleton shimmer that falls back to a static block under `prefers-reduced-motion` (#833)
- `tonal` button variant for warm secondary actions (#824)
- Card density options plus a `CardKpi` sub-component for compact, left-aligned KPI display (#825)
- Sidebar section labels, an accent-bordered active item, and a proper wordmark lockup in the sidebar header (#826, #834)
- Semantic `--success` / `--warning` / `--danger` tokens with matching badge variants, so status chips read as colour rather than a heavy graphite pill (#1094)
- Dashboards can now be renamed from the UI — the API supported it but nothing called it (#1045)
- Saving and deleting a dashboard now confirms with a toast instead of succeeding silently (#1046)
- Dashboard list search with an empty state, and a non-blocking warning when a new dashboard reuses an existing name (#1048)
- Branded not-found page for invalid or inaccessible dashboard URLs, replacing the stock Next.js 404 (#1047)
- Legend position control (top/bottom/left/right) for bar and line charts (#1053)
- Connections can be renamed from the edit dialog, the list shows per-connector-type icons, and the silent 25-row preview cap is now stated in the UI (#1043)
- API keys list shows a masked key prefix so a token seen in logs can be matched to a row (#1038)
- "API Docs" entry in settings — the Swagger UI at `/api/docs` existed but was undiscoverable (#1056)
- Dashboard shares can have their role changed inline, and an Editor share on a reader-role user is labelled as having no effect rather than silently doing nothing (#1056)
- Form widgets warn at configuration time when the selected connection is read-only, instead of failing when an end user submits (#1051)
- Accessible empty and error states — a screen-reader-readable "No data" element for bar charts (#1053), a polished data-grid empty state (#1105), an icon for the single-value error state (#1106), descriptive aria labels on every chart type (#1108), and a status role on the connection badge (#1059)

### Changed

- **BREAKING — the default colour palette is replaced.** Deep Ocean is gone; `--primary`, `--background`, `--accent` and the `--chart-1`–`--chart-10` data colours all carry new values (near-black graphite base, citrine amber data palette, colourblind-checked). The palette id `deep-ocean` and the `DEEP_OCEAN_LIGHT` / `DEEP_OCEAN_DARK` exports still resolve — they alias the new Citrine default — so existing dashboards keep rendering, but they do not look the same. Anything that hardcoded the old values, or assumed a single uniform `--radius`, needs revisiting (#820, #821, #831)
- **BREAKING — the interaction accent is indigo, not amber.** `--ring`, `--accent` and `--accent-soft` moved to indigo, because amber collided with the warning colour and could not hold a 3:1 focus-indicator contrast on white. Citrine moved to a new `--brand` token (the wordmark), amber is now warning-only, and the chart data palette stays citrine (#1104). Reversed in 1.3.0 (#1125)
- **BREAKING — typography no longer falls back to `system-ui`.** Headings render in Geist Sans and body text in Inter, both self-hosted (#830)
- **BREAKING — control heights changed from `h-9` to `h-10`** for buttons, inputs and selects, and the harsh blue focus ring is replaced by a softer two-pixel accent ring with an offset. Layouts that depended on the old heights will shift (#824, #827)
- **BREAKING — Tabs default to an underlined style.** Pass `variant="pill"` to keep the previous filled look (#829)
- Charts ship styled out of the box: compact axis numbers (`45.2K`, not `45,200`), soft gridlines, 1.5px lines with a fading gradient fill, rounded bar tops with values no longer floating above them, gapped pie slices, and tooltips that match the app's popover styling (#822)
- Cards use the medium shadow by default, and dropdowns, popovers and dialogs use the large one, so layers are visually distinct (#823)
- Dialogs fade and slide in over a blurred backdrop instead of scaling in over a solid black overlay (#828)
- Connection test failures are classified and actionable — "Connection check returned false" no longer stands in for wrong password, unknown host and closed port alike; a blocked write in the query preview says writes aren't allowed instead of surfacing a wrapper syntax error; the create form reports all missing fields at once; and a malformed URI is caught before it can be saved (#1043)
- Query read-only enforcement is now explicit: `accessMode` is passed from every call site to the connector rather than relying on a default being spread into config (#1044)
- A view-only sharee's write attempt returns 403 like any other read-only denial, instead of 404; non-sharees still get 404 so dashboard existence isn't leaked (#1056)
- Parameter names are normalised, so calling a parameter `param_status` yields `$param_status` rather than the doubled `$param_param_status`; and the widget-editor preview now shows "Waiting for parameters…" for unbound tokens instead of a raw Postgres syntax error (#1055)
- Data grid polish — the rows-per-page control shows the current page size, snake_case column names are humanised in the hide-columns panel, and rows have a hover highlight (#1055)
- Changing your own password now redirects to the login page instead of showing a raw "Unauthorized" (#1035)
- Failed dashboard imports name the offending field near the preview instead of a bare "Required" under the file picker (#1048)
- Widget Lab cards for content-only widgets (Markdown, iframe) show a neutral "Content widget" label instead of an inherited connector tag and "No query", and long template names get a tooltip (#1053)
- Password form and profile polish — inline styled validation replaces native browser tooltips, the duplicated success alert plus toast is now a single signal, the users table renders one consistent role control on every row, and password fields carry the right `autocomplete` attributes (#1038)
- Focus rings, motion and radii across the composed components were routed through tokens rather than one-off values (#832, #1096)

### Fixed

- PostgreSQL `DATE` and `TIMESTAMP` columns serialised to `{}`, making raw temporal columns unusable in tables and charts (#1054)
- Table styling rules targeting "color" silently applied no text colour (#1057)
- `neoboard demo seed`, `db seed` and `db reset` encrypted connector credentials with the wrong key in Docker mode, so every seeded widget failed to decrypt (#1039)
- The connection "Duplicate" action copied only the name, leaving URI, username and database blank (#1042)
- Connection dialog footer buttons scrolled out of view once Advanced Settings was expanded (#1041)
- A credential decrypt failure during a connection test surfaced as a raw 500 with a generic message instead of an actionable result (#1040)
- Logging out preserved `callbackUrl`, so the next user to log in landed on the previous user's page (#1037)
- The "Create User" button rendered for reader-role users on `/users` even though the action was denied (#1036)
- The Markdown widget's content field was a single-line input, making multi-line markdown impossible (#1049)
- Graph-dense dashboards exhausted the browser's WebGL context limit and left dead canvases; graph widgets are now mounted only when in the viewport (#1052)
- `PageHeader` used `text-2xl font-bold`, breaking the new type scale on every page (#1058)
- Chart legibility and brand consistency — labels on coloured fills in treemap, sunburst and circle packing (#1095), circle-packing parent labels hidden behind their children (#1101), off-brand hardcoded colours in gantt, pie and choropleth (#1107), geo colours and map markers (#1100), and the circle-packing, graph and gauge palettes (#1097, #1098)
- Maps lost their pan and zoom on every re-render, and graph node selection wasn't reflected back into the view (#1113)
- Treemap tile labels broke mid-word instead of ellipsising at the tile edge (#1053)

### Security

- Widget query failures no longer render the raw database driver exception to every role — readers see a clean message, and driver detail is withheld from non-owners, so dialect and schema fragments don't leak through a shared dashboard (#1050)
- Read-only enforcement no longer rests on an implicit config default that a refactor could silently drop; the access mode is passed explicitly and pinned by tests (#1044)
- iframe widget URLs are validated at configuration time — `javascript:` and `data:` schemes are rejected and plain `http` is flagged (#1053)

### Removed

- The app no longer pulls a second copy of Inter from Google Fonts; the self-hosted `--font-body` face is the single source (#1059)
- Dead `chartTypePreviewColors` map (#1102)

## [1.0.0] — 2026-05-17 — First public release

The polish cycle on top of `2.0.0` ahead of v1.0 going public. Focuses on first-time-user experience: clearer errors, actionable hints, troubleshooting docs, and fail-fast configuration.

### Added

- `neoboard logs` and `neoboard plugin` unit test coverage (#793, #794)
- Actionable error classification for `neoboard db migrate` failures with connection/lock/schema/unknown buckets and per-bucket recovery hints (#795)
- Comprehensive setup troubleshooting guide covering npm install, Docker port conflicts, DB connection refusals, migration drift, ENCRYPTION_KEY mistakes — plus runbooks for Apple Silicon Docker issues, OAuth redirect mismatches behind a reverse proxy, and production ENCRYPTION_KEY loss recovery (#796)
- Documentation for ENCRYPTION_KEY rotation and credential-loss semantics (#797)
- Advanced `defineChartPlugin` API documentation (#798)
- Actionable hints for plugin validator failures pointing at the authoring docs (#799)
- Connection test error classification (`auth` / `network` / `bad_uri`) with hint surface in the UI (#800)
- HTTP `Retry-After` header for transient query failures so clients back off correctly (#802)
- Healthcheck for the `neoboard` service in the full-stack Docker compose (#803)
- "Administration" section in the docs sidebar — deployment checklist, monitoring, and backup-restore pages are now navigable
- Fail-fast environment validation at cold start — required vars (`ENCRYPTION_KEY`, `NEXTAUTH_SECRET`, `DATABASE_URL`) are checked in `register()` and surface a clear stderr listing instead of cryptic runtime errors. `SKIP_ENV_VALIDATION=1` is the build-script escape hatch.
- Reader-role empty-dashboard state CTA — first-time readers now see a "Read the docs" button instead of a dead-end message
- `@neoboard/cli` published to npm — `npx @neoboard/cli setup` is the recommended install path

### Changed

- Comprehensive annotations on `app/.env.example` covering every variable, required/optional status, generation commands, and rotation warnings (#801)
- `REGISTRATION_ENABLED` default flipped to `false` so production deployments don't accidentally ship an open `/signup` endpoint. Dev and demo flows enable it explicitly.
- README quick start leads with `npx @neoboard/cli setup`; the cloned-repo path remains for contributors
- Workspace versions reset from `2.0.0` to `1.0.0` to match the first-public-release branding

### Fixed

- E2E suite updated to assert the new `408 + Retry-After` behavior for transient query failures introduced by #802

### Security

- Cold-start env validation refuses to boot when required secrets are missing or malformed, preventing the app from running with weak defaults

## [2.0.0] — 2026-05-02

### Added

- CSV export for widget cards (RFC 4180 compliant, formula-prefix quoting)
- GFM markdown table support with alignment markers
- Clickable missing parameter badges with scroll-to-source
- Client-side data transforms pipeline (filter, sort, groupBy, calculatedColumn, rename, limit)
- Transform tab in widget editor with pipeline-aware column propagation
- Parameter support ($param_xxx) in transform filter values and calculated expressions
- Production Dockerfile and docker-compose.prod.yml
- OSS governance files (LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY)
- GitHub issue and PR templates
- Dependabot configuration for automated dependency updates
- Husky pre-commit hook with lint-staged (ESLint + Prettier)
- jsdom component tests enabled in app/ package
- Demo seed dashboards (Transform Playground)
- Database selector for per-widget database/schema override (#633)
- Per-card write toggle with server-side `can_write` enforcement (#633)
- Circle packing and choropleth chart gallery demo pages (#630)
- NeoDash migration tool: settings mapping and conversion notes (#626)
- Widget editor sub-component unit tests (#628)
- /api/health endpoint for container orchestration and Docker healthchecks

### Changed

- License: Elastic License 2.0 with AI training restriction
- Widget editor: eliminated bidirectional state sync (Zustand store as single source of truth)
- Extracted pure business logic from components into testable lib/ files
- Widget editor decomposed into focused sub-components (#627)

### Fixed

- XSS: split URL validators (link vs image), strip tab/newline bypass
- CSV injection: quote cells starting with =, @, +, -
- Cache invalidation key in widget editor (was using widget.id instead of query key)
- Editor cache lookup for parameterized widgets (partial key match)
- Null/undefined values matching numeric zero in transform filters
- Query editor test teardown leak (dangling timers)
- Build: resolve pg/tls client bundle error breaking E2E tests (#629)
- Pre-existing type errors on release/2.0 branch (#632)
- Resolved npm audit production vulnerabilities (lodash, postcss, uuid overrides)

### Security

- Markdown widget: block data:image/svg+xml in link href (XSS vector)
- URL sanitization: strip ASCII tabs/newlines before protocol check

## [0.9.1] — 2026-03-27

### Added

- Connection pluggability: abstract driver type, ConnectorError normalization, split AdvancedConnectionOptions
- Coverage push: app hooks 18%→61%, component 77%→85%, cypher-lang smoke tests
- E2E tests for v0.9 features
- CI and CodeRabbit config for release/\* branches

### Fixed

- Flaky E2E tests marked as test.fixme()
- SonarCloud code smells and security hotspots

## [0.8.0] — 2026-03-17

### Added

- New chart types: Gauge, Sankey, Sunburst, Radar, Treemap
- Rule-based styling with operators, parameter comparison, multi-target support
- Click actions: set-parameter, navigate-to-page, set-parameter-and-navigate
- Action rules editor with per-column click triggers
- Color palettes (deep-ocean, warm-sunset, neon, monochrome)
- Colorblind mode for all chart types
- Chart accessibility: ARIA labels, role="img"

## [0.7.0] — 2026-03-10

### Added

- REST API for connections, dashboards, users, widget templates
- API key authentication
- Swagger/OpenAPI documentation
- Widget Lab: save, browse, and apply widget templates

## [0.6.0] — 2026-03-03

### Added

- Widget Lab and template management
- Dashboard export/import (JSON)
- Widget duplication

## [0.5.0] — 2026-02-24

### Added

- Parameter widgets (select, multi-select, date, date-range, date-relative, freetext)
- Form widget with write query support
- Dashboard page tabs

## [0.4.0] — 2026-02-17

### Added

- Form widget for Neo4j CREATE/PostgreSQL INSERT
- Write query execution with can_write permission enforcement
- Form fields editor

## [0.3.0] — 2026-02-10

### Added

- Dashboard grid layout with drag-and-drop
- Multi-page dashboards
- Widget card with actions menu

## [0.2.0] — 2026-02-03

### Added

- PostgreSQL connector with connection pooling
- Advanced connection options (timeouts, pool size, SSL)
- Connection testing (inline and saved)

## [0.1.0] — 2026-01-27

### Added

- Initial foundation: Next.js 15, Auth.js v5, Drizzle ORM
- Neo4j connector with Cypher query execution
- Bar, Line, Pie, Table, Single Value, JSON Viewer chart types
- CodeMirror 6 query editor with Cypher syntax highlighting
- User management with admin/creator roles
- AES-256-GCM credential encryption
- Multi-tenant architecture with tenant_id isolation

[1.0.0]: https://github.com/alfredo1996/neoboard/releases/tag/v1.0.0
[2.0.0]: https://github.com/alfredo1996/neoboard/releases/tag/v2.0.0
