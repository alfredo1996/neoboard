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
 *   2. Add `registerPluginFromFile("./your-chart")` here
 *
 * During the v1.1 plugin migration, charts are moved from the legacy
 * switch statement in chart-renderer.tsx into this registry one by one.
 * Charts not yet migrated continue to work via the switch fallback.
 */

import { pluginRegistry } from "./registry";
import { markdownPlugin } from "./markdown";

// Idempotent registration — the first import of this module registers
// plugins; subsequent imports are no-ops thanks to Node's module cache.
if (!pluginRegistry.has(markdownPlugin.type)) {
  pluginRegistry.register(markdownPlugin);
}

// Re-export for convenience
export { pluginRegistry } from "./registry";
