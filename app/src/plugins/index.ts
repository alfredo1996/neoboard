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
import { EXTERNAL_PLUGINS } from "./external-plugins.generated";
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
import { ganttPlugin } from "./gantt";

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
  ganttPlugin,
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

// ── External plugins (from neoboard-plugins.json) ───────────────────────
// Registered AFTER built-ins so external plugins can replace a built-in
// chart type — but only when their manifest entry has `overrides: true`.
// Same-type duplicates without overrides throw loudly so operators spot
// the conflict at startup instead of debugging a silent replacement.
for (const { plugin, overrides } of EXTERNAL_PLUGINS) {
  try {
    if (!plugin || typeof plugin !== "object" || !plugin.type) {
      console.error(
        "External plugin skipped: invalid plugin object (missing type)",
      );
      continue;
    }
    if (pluginRegistry.has(plugin.type)) {
      if (!overrides) {
        console.error(
          'External plugin "' +
            plugin.type +
            '" conflicts with an existing plugin. ' +
            'Set "overrides": true in neoboard-plugins.json to replace it. Skipping.',
        );
        continue;
      }
      pluginRegistry.unregister(plugin.type);
    }
    pluginRegistry.register(plugin);
  } catch (err) {
    console.error(
      "External plugin registration failed for type " +
        JSON.stringify(plugin?.type) +
        ":",
      err,
    );
    // Continue loading remaining plugins — one broken plugin shouldn't crash the app
  }
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
