/**
 * Global chart plugin registry.
 *
 * Singleton instance used by chart-renderer.tsx to look up plugins at
 * render time. Plugins are registered via the `plugins/index.ts` module
 * which is imported once when the app starts.
 *
 * This file is intentionally minimal — the registry implementation lives
 * in `app/src/lib/chart-plugin-registry.ts`. This module just holds the
 * singleton and re-exports the types for convenience.
 */

import { createPluginRegistry } from "@/lib/chart-plugin-registry";

export const pluginRegistry = createPluginRegistry();

export type {
  ChartPlugin,
  ChartPluginConfig,
} from "@/lib/chart-plugin-registry";
export { defineChartPlugin } from "@/lib/chart-plugin-registry";
