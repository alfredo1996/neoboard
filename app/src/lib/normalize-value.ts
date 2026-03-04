/**
 * Normalize raw query values for chart display.
 *
 * Converts Date objects and other non-primitive values into
 * display-friendly strings so charts never render `[object Object]`.
 *
 * Neo4j-specific types (Integer, Date, DateTime) are converted to
 * native JS types at the connection boundary (Neo4jRecordParser),
 * so this function is DB-agnostic.
 */

/**
 * Normalize a single value for chart display.
 *
 * - `null` / `undefined` → `null` (callers decide how to handle)
 * - `string` / `number` / `boolean` → returned as-is
 * - `Date` → ISO date string
 * - Other objects → `JSON.stringify` fallback
 */
export function normalizeValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return v;
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? String(v) : v.toISOString().slice(0, 19).replace("T", " ");
  }
  // Generic object fallback — stringify to avoid [object Object]
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
