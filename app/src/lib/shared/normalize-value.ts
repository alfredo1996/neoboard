/**
 * Normalize raw query values for chart display.
 *
 * Converts non-primitive values into display-friendly strings so charts never
 * render `[object Object]`.
 *
 * Every connector's values arrive as the SDK's row value contract (#1904):
 * temporals are ISO-8601 strings, numbers past a double are decimal strings.
 * A `Date` cannot reach here — rows cross JSON — so the branch that turned one
 * into `"YYYY-MM-DD HH:mm:ss"` is gone (#1925). It was worse than dead: that
 * space-separated form is re-parsed as LOCAL time, while the value it came
 * from was UTC.
 */

/**
 * Normalize a single value for chart display.
 *
 * - `null` / `undefined` → `null` (callers decide how to handle)
 * - `string` / `number` / `boolean` → returned as-is
 * - Other objects → `JSON.stringify` fallback
 */
export function normalizeValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return v;
  // Generic object fallback — stringify to avoid [object Object]
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
