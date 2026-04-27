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
import { validatePluginStubSync } from "@/lib/plugin/chart-helpers";
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
import { circlePackingPlugin } from "./circle-packing";
import { choroplethPlugin } from "./choropleth";

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
  circlePackingPlugin,
  choroplethPlugin,
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

// 1. Every CHART_TYPES entry must have a registered plugin.
const registeredTypes = new Set(pluginRegistry.getTypes());
for (const t of CHART_TYPES) {
  if (!registeredTypes.has(t)) {
    console.warn(
      `Chart type "${t}" declared in CHART_TYPES but no plugin registered`,
    );
  }
}

// 2. Validate compatibleWith references actual connector types.
// Uses the canonical CONNECTOR_TYPES from the connection package
// so new connectors are automatically recognized.
import { CONNECTOR_TYPES as KNOWN_CONNECTOR_LIST } from "@neoboard/connection";
const KNOWN_CONNECTORS = new Set<string>(KNOWN_CONNECTOR_LIST);
for (const type of pluginRegistry.getTypes()) {
  const plugin = pluginRegistry.get(type);
  if (plugin?.compatibleWith) {
    for (const ct of plugin.compatibleWith) {
      if (!KNOWN_CONNECTORS.has(ct)) {
        console.warn(
          'Plugin "' +
            type +
            '" declares compatibleWith "' +
            ct +
            '" but no such connector is registered',
        );
      }
    }
  }
}

// 3. Validate stub/plugin capability sync (dev only).
validatePluginStubSync();

// 4. Log registration summary for debugging.
if (typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
  const builtInCount = BUILT_IN_PLUGINS.length;
  const externalCount = EXTERNAL_PLUGINS.length;
  const totalRegistered = pluginRegistry.getTypes().length;
  console.log(
    "[plugins] Registered " +
      totalRegistered +
      " chart types (" +
      builtInCount +
      " built-in" +
      (externalCount > 0 ? ", " + externalCount + " external" : "") +
      ")",
  );
}

// Re-export for convenience
export { pluginRegistry } from "./registry";
export { CHART_TYPES, type ChartType } from "./chart-types";
