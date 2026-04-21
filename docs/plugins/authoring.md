# Authoring external chart plugins for NeoBoard

NeoBoard loads external chart plugins at **build time** via a manifest
at the repository root: `neoboard-plugins.json`. This doc walks through
writing a plugin, wiring it into the manifest, and the trust model you
sign up for as an operator.

## Trust model (read this first)

- Plugins run **in-process** inside the NeoBoard Next.js app. They have
  the same access as any first-party code: React context, the plugin
  registry, the network, environment variables in the browser bundle.
- Declaring a plugin in `neoboard-plugins.json` requires filesystem +
  commit access to the repo and an `npm install`. This is **not** a
  runtime-pluggable surface — there is no UI or API to add a plugin.
- **There is no sandbox.** A malicious plugin can exfiltrate the user's
  session. Treat external plugins the same as any other npm dependency
  you bundle into your production build.
- Review plugin source before adding it to the manifest. Prefer plugins
  you've authored, or packages from a vendor you trust.

## Plugin shape

A plugin is a `ChartPlugin` object (see
`app/src/lib/plugin/chart-plugin-registry.ts` for the full type). The
minimum viable plugin:

```ts
import { defineChartPlugin } from "@neoboard/app/plugin-sdk"; // see note below
import { MyChart } from "./component";

export default defineChartPlugin({
  type: "heatmap",
  label: "Heatmap",
  component: MyChart,
  transform: (rows) => rows, // whatever shape your component consumes
});
```

Fields at a glance:

| Field            | Required | What it does                                                                                                                          |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `type`           | yes      | Unique chart identifier (e.g. `"heatmap"`). Must not collide with a built-in unless you also set `"overrides": true` in the manifest. |
| `label`          | yes      | Human-readable name in the chart picker.                                                                                              |
| `component`      | yes      | React component rendered inside the widget card.                                                                                      |
| `transform`      | yes      | `(rawRows) → yourShape` — normalizes the query result for your component.                                                             |
| `options`        | no       | Chart-option panel config. See `app/src/plugins/bar/options.ts` for a full example.                                                   |
| `queryHint`      | no       | Short example query + expected columns shown in the editor.                                                                           |
| `compatibleWith` | no       | Array of connector types (`"neo4j"`, `"postgresql"`). Omit = all.                                                                     |
| `stylingTargets` | no       | Conditional-styling targets (e.g. `[{ value: "color", label: "Color" }]`).                                                            |
| `capabilities`   | no       | Overrides for `supportsClickAction`, `supportsStyling`, `isECharts`, `requiresQuery`.                                                 |
| `settingsSchema` | no       | Zod schema for the settings object. Recommended — lets you `.parse()` raw settings in your component.                                 |

## Package layout

Your plugin should be an npm package. Minimum structure:

```
my-neoboard-plugin/
├── package.json
├── src/
│   ├── index.ts       # exports default plugin
│   ├── component.tsx  # React component
│   └── settings.ts    # Zod schema (optional)
└── tsconfig.json
```

`package.json` must declare `"main"` / `"module"` / `"types"` that point
at a published bundle — NeoBoard imports your package like any other npm
dep. Peer-depend on `react` and (if you use them) `zod` and
`@neoboard/components` so they don't get bundled twice.

```json
{
  "name": "@myorg/neoboard-heatmap",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "react": ">=19"
  }
}
```

## Wiring it in

1. `npm install @myorg/neoboard-heatmap` in the NeoBoard repo root.
2. Add an entry to `neoboard-plugins.json`:

   ```json
   {
     "$schema": "./neoboard-plugins.schema.json",
     "plugins": [{ "package": "@myorg/neoboard-heatmap" }]
   }
   ```

3. Run `npm run generate:plugins` (or just start dev/build — it's wired
   into `predev` and `prebuild`).
4. A new chart type `"heatmap"` appears in the widget editor.

### Named exports

By default the generator imports the package's `default` export. To use
a named export:

```json
{ "package": "@myorg/neoboard-charts", "export": "heatmap" }
```

### Overriding a built-in

External plugins that reuse a built-in chart type (`"bar"`, `"pie"`,
etc.) are **rejected at startup** unless the manifest entry opts in:

```json
{ "package": "@myorg/neoboard-bar-plus", "overrides": true }
```

This is deliberate — silent overrides are a nightmare to debug. If
you're replacing a built-in, say so out loud.

## Development loop

The manifest is resolved at build time, so you'll want a local
workflow:

1. `npm link` your plugin package during development so changes in
   your plugin are immediately visible in NeoBoard's `node_modules`.
2. Restart the dev server after editing `neoboard-plugins.json` (the
   import statements are regenerated by the `predev` hook).

## Failure modes

| Symptom                                                              | Likely cause                                                                                                                                             |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cannot find module '@myorg/foo'` at build time                      | Package not installed. Run `npm install` in the repo root.                                                                                               |
| `External plugin "bar" conflicts with an existing plugin` at startup | Your plugin's `type` matches a built-in and `overrides` is `false`. Either rename or set `"overrides": true`.                                            |
| Widget renders blank / throws                                        | Your plugin's component threw. `ChartErrorBoundary` (each widget has one) catches it and shows an inline error. Check the browser console for the stack. |
| Chart options panel is empty                                         | `options` is undefined. Declare option keys in your plugin.                                                                                              |

## Testing your plugin

Treat your plugin as a normal React library: unit-test the `transform`
function, snapshot-test the component with sample data, ship it as an
npm package with its own test suite. NeoBoard does not run your tests.

Integration testing against a real NeoBoard install is the most
reliable signal. A stripped-down example lives in
`examples/plugin-sparkline/` (coming soon) — clone it, rename, ship.
