import type {
  ChartPlugin,
  PluginRegistry,
} from "@/lib/plugin/chart-plugin-registry";

/** One entry of `neoboard-plugins.json`, after its module has been imported. */
export interface ExternalPluginEntry {
  plugin: ChartPlugin | null;
  overrides: boolean;
}

/**
 * Register external plugins, skipping a bad one rather than crashing the app.
 *
 * Registered AFTER the built-ins so an external plugin can replace a built-in
 * chart type — but only when its manifest entry says `overrides: true`.
 * Same-type duplicates without it are reported loudly so an operator spots the
 * conflict at startup instead of debugging a silent replacement.
 *
 * Lives in its own module because it used to be an inline loop in index.ts,
 * which cannot be imported and called — so the hardening tests re-implemented
 * it and asserted on the copy (#1629). Every guarantee below was proven about
 * a function no production code path ran.
 */
export function registerExternalPlugins(
  registry: PluginRegistry,
  entries: readonly ExternalPluginEntry[],
): void {
  for (const { plugin, overrides } of entries) {
    try {
      if (!plugin || typeof plugin !== "object" || !plugin.type) {
        console.error(
          "External plugin skipped: invalid plugin object (missing type)",
        );
        continue;
      }
      if (registry.has(plugin.type)) {
        if (!overrides) {
          console.error(
            'External plugin "' +
              plugin.type +
              '" conflicts with an existing plugin. ' +
              'Set "overrides": true in neoboard-plugins.json to replace it. Skipping.',
          );
          continue;
        }
        registry.unregister(plugin.type);
      }
      registry.register(plugin);
    } catch (err) {
      console.error(
        "External plugin registration failed for type " +
          JSON.stringify(plugin?.type) +
          ":",
        err,
      );
      // Carry on — one broken plugin must not take the app down with it.
    }
  }
}
