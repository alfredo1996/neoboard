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
import { CHART_TYPES } from "./chart-types";
import { markdownPlugin } from "./markdown/component";
import { barPlugin } from "./bar/component";
import { linePlugin } from "./line/component";
import { piePlugin } from "./pie/component";
import { singleValuePlugin } from "./single-value/component";
import { graphPlugin } from "./graph/component";
import { mapPlugin } from "./map/component";
import { tablePlugin } from "./table/component";
import { parameterSelectPlugin } from "./parameter-select/component";
import { jsonPlugin } from "./json/component";
import { formPlugin } from "./form/component";
import { iframePlugin } from "./iframe/component";
import { gaugePlugin } from "./gauge/component";
import { sankeyPlugin } from "./sankey/component";
import { sunburstPlugin } from "./sunburst/component";
import { radarPlugin } from "./radar/component";
import { treemapPlugin } from "./treemap/component";

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
  // Unregister stubs (from chart-helpers.ts) so real plugins always win
  if (pluginRegistry.has(plugin.type)) {
    pluginRegistry.unregister(plugin.type);
  }
  pluginRegistry.register(plugin);
}

// ── Startup validation ──────────────────────────────────────────────────
// Verify that every chart type declared in CHART_TYPES has a registered
// plugin. A mismatch is a dev-time bug, not a runtime error.
const registeredTypes = new Set(pluginRegistry.getTypes());
for (const t of CHART_TYPES) {
  if (!registeredTypes.has(t)) {
    console.warn(
      `Chart type "${t}" declared in CHART_TYPES but no plugin registered`,
    );
  }
}

// Re-export for convenience
export { pluginRegistry } from "./registry";
export { CHART_TYPES, type ChartType } from "./chart-types";
