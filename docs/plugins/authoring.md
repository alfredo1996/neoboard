# Authoring external plugins for NeoBoard

NeoBoard supports two types of external plugins:

- **Chart plugins** — add new visualization types (heatmap, waterfall, etc.)
- **Connector plugins** — add new database connectors (MongoDB, MySQL, etc.)

Both are loaded at **build time** via manifest files at the repository root:

- `neoboard-plugins.json` — chart plugins
- `neoboard-connectors.json` — connector plugins

The easiest way to manage plugins is via the CLI:

```bash
# Add a plugin (auto-detects chart vs connector)
neoboard plugin add @myorg/neoboard-mongodb

# List all plugins
neoboard plugin list

# Remove a plugin
neoboard plugin remove @myorg/neoboard-mongodb
```

You can also edit the manifest files directly — see below.

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

**Option A: CLI (recommended)**

```bash
neoboard plugin add @myorg/neoboard-heatmap
```

This installs the package, validates the export, adds it to the manifest,
and runs codegen — all in one command.

**Option B: Manual**

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

Either way, a new chart type `"heatmap"` appears in the widget editor.

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

---

## Connector plugins

Connector plugins work the same way as chart plugins but target the
`connection/` package instead of `app/`. They add support for new
database types (MongoDB, MySQL, ClickHouse, etc.).

### Connector plugin shape

A connector plugin is a `ConnectorPlugin` object (see
`connection/src/generalized/connector-plugin.ts` for the full type):

```ts
import type { ConnectorPlugin } from "@neoboard/connection";

export const plugin: ConnectorPlugin = {
  type: "mongodb",
  label: "MongoDB",
  category: "database",
  queryLanguage: "javascript",
  supportsWrite: true,
  supportsGraphData: false,
  allowedProtocols: ["mongodb:", "mongodb+srv:"],
  uriPlaceholder: "mongodb://localhost:27017/mydb",
  databasePlaceholder: "mydb",
  formFields: [
    { key: "database", label: "Database", type: "text", required: true },
    {
      key: "authSource",
      label: "Auth Source",
      type: "text",
      placeholder: "admin",
    },
  ],
  createModule(authConfig, advancedOptions) {
    return new MongoConnectionModule(authConfig, advancedOptions);
  },
};
```

| Field               | Required | What it does                                                                     |
| ------------------- | -------- | -------------------------------------------------------------------------------- |
| `type`              | yes      | Unique connector identifier (e.g. `"mongodb"`).                                  |
| `label`             | yes      | Human-readable name in the connection type picker.                               |
| `category`          | yes      | One of: `"database"`, `"graph"`, `"api"`, `"file"`.                              |
| `createModule`      | yes      | Factory function that returns a `ConnectionModule` instance.                     |
| `queryLanguage`     | no       | CodeMirror language for syntax highlighting (`"sql"`, `"cypher"`, etc.).         |
| `supportsWrite`     | no       | Whether the connector supports INSERT/UPDATE/DELETE.                             |
| `supportsGraphData` | no       | Whether queries can return nodes and edges.                                      |
| `allowedProtocols`  | no       | URI protocols for connection string validation.                                  |
| `formFields`        | no       | Auto-generated connection form fields. When present, no custom form code needed. |

### Wiring a connector

**Option A: CLI (recommended)**

```bash
neoboard plugin add @myorg/neoboard-mongodb
# ✔ Installed @myorg/neoboard-mongodb
# ✔ Plugin "mongodb" registered as connector in neoboard-connectors.json
```

The CLI auto-detects that the package has `createModule` and registers it
as a connector (not a chart).

**Option B: Manual**

1. `npm install @myorg/neoboard-mongodb`
2. Add to `neoboard-connectors.json`:
   ```json
   { "connectors": [{ "package": "@myorg/neoboard-mongodb" }] }
   ```
3. Run `npm run generate:connectors`

### Server-side considerations

Unlike chart plugins (client-side React), connectors run **server-side**:

- The driver npm package must be in `dependencies` (not dynamically downloaded)
- The driver must be added to `serverExternalPackages` in `next.config.ts`
- The `ConnectionModule` runs in Node.js — no browser APIs
- Schema fetching (`getSchema()`) is optional but enables query editor autocomplete

### ConnectionModule interface

Your connector must implement the `ConnectionModule` abstract class:

```ts
import { ConnectionModule } from "@neoboard/connection";

export class MongoConnectionModule extends ConnectionModule {
  async connect(): Promise<void> {
    /* ... */
  }
  async disconnect(): Promise<void> {
    /* ... */
  }
  async executeQuery(query: string, params?: Record<string, unknown>) {
    /* ... */
  }
  async getSchema(): Promise<SchemaResult> {
    /* ... */
  }
  async testConnection(): Promise<boolean> {
    /* ... */
  }
}
```

### Removing a plugin

```bash
neoboard plugin remove @myorg/neoboard-mongodb
# ✔ Plugin "@myorg/neoboard-mongodb" removed
```

Or manually: remove the entry from the manifest file and run
`npm uninstall @myorg/neoboard-mongodb`.

Built-in plugins (neo4j, postgresql, bar, line, etc.) cannot be removed.
