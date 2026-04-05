/**
 * Plugin registrations — imports and registers all chart plugins.
 *
 * Importing this module has the side effect of registering each built-in
 * plugin with the global registry. Called once at app startup via an
 * import in chart-renderer.tsx (or wherever the registry is first used).
 *
 * To add a new chart plugin:
 *   1. Create `app/src/plugins/your-chart.ts` that exports a plugin
 *      via `defineChartPlugin({ ... })`
 *   2. Add the plugin to the BUILT_IN_PLUGINS array below
 *
 * As of PR 4, all chart types are registered here — chart-renderer's
 * switch statement has been removed and plugin lookup is the only path.
 */

import { pluginRegistry } from "./registry";
import { markdownPlugin } from "./markdown";
import { barPlugin } from "./bar";
import { linePlugin } from "./line";
import { piePlugin } from "./pie";
import { singleValuePlugin } from "./single-value";
import { graphPlugin } from "./graph";
import { mapPlugin } from "./map";
import { tablePlugin } from "./table";
import { parameterSelectPlugin } from "./parameter-select";
import { jsonPlugin } from "./json";
import { formPlugin } from "./form";
import { iframePlugin } from "./iframe";
import { gaugePlugin } from "./gauge";
import { sankeyPlugin } from "./sankey";
import { sunburstPlugin } from "./sunburst";
import { radarPlugin } from "./radar";
import { treemapPlugin } from "./treemap";

const BUILT_IN_PLUGINS = [
  markdownPlugin,
  barPlugin,
  linePlugin,
  piePlugin,
  singleValuePlugin,
  graphPlugin,
  mapPlugin,
  tablePlugin,
  parameterSelectPlugin,
  jsonPlugin,
  formPlugin,
  iframePlugin,
  gaugePlugin,
  sankeyPlugin,
  sunburstPlugin,
  radarPlugin,
  treemapPlugin,
];

// Idempotent registration — the first import of this module registers
// plugins; subsequent imports are no-ops thanks to Node's module cache.
for (const plugin of BUILT_IN_PLUGINS) {
  if (!pluginRegistry.has(plugin.type)) {
    pluginRegistry.register(plugin);
  }
}

// Re-export for convenience
export { pluginRegistry } from "./registry";
