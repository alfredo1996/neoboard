import type { ZodTypeAny, z } from "zod";

/**
 * Plugin-namespaced warning emitter. We intentionally do NOT use the
 * pino-based `@/lib/logger` here: plugin components render client-side
 * and bundling pino into the browser fails (it imports `node:crypto`).
 * Schema fallbacks happen during render → operators see them via the
 * browser console (and the surrounding server logs when the page reloads).
 * Structured shape preserves searchability.
 */
function emitWarning(pluginId: string, issues: unknown): void {
  console.warn("[plugin] Settings failed validation; reverted to defaults", {
    pluginId,
    issues,
  });
}

/**
 * Parse plugin settings with Zod, falling back to schema defaults on
 * validation failure. Never throws on user-provided data.
 *
 * **Why**: a single stale or unknown enum value in a saved widget config
 * would otherwise crash the plugin component (`schema.parse(raw)` throws
 * → React renders an error boundary → the widget is blank). This is bad
 * UX: a v1.0 dashboard that referenced a layout value later renamed in
 * v1.1 would blank out for everyone until the user manually re-saved.
 *
 * Behavior on validation failure:
 *  1. Emit a structured warn-level log entry (operators can spot drift)
 *  2. Return the result of `schema.parse({})` — which yields the schema's
 *     defaults across the board
 *  3. If even that throws, propagate — that means the schema *itself* is
 *     broken (not the user's data), which deserves an error boundary
 *
 * @param schema    the plugin's Zod settings schema
 * @param raw       the unknown value passed by the widget renderer
 * @param pluginId  the chart type registered with the plugin (e.g. "graph",
 *                  "bar") — included in the log entry so operators know
 *                  which plugin had stale data
 */
export function safeParseSettings<T extends ZodTypeAny>(
  schema: T,
  raw: unknown,
  pluginId: string,
): z.infer<T> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;

  emitWarning(pluginId, result.error.issues);

  // Defaults pass: if THIS throws, the schema itself is bad — surface to the
  // error boundary. We deliberately don't double-catch here.
  return schema.parse({});
}
