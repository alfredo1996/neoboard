/**
 * Normalize raw query values for chart display.
 *
 * Converts Date objects, Neo4j Integer/DateTime structures, and other
 * non-primitive values into display-friendly strings so charts never
 * render `[object Object]`.
 */

/**
 * Detects whether a value is a serialized Neo4j Integer ({low, high}).
 */
function isNeo4jInteger(v: unknown): v is { low: number; high: number } {
  return (
    v !== null &&
    typeof v === "object" &&
    "low" in v &&
    "high" in v &&
    typeof (v as Record<string, unknown>).low === "number"
  );
}

/**
 * Detects whether a value is a serialized Neo4j DateTime / Date / Time
 * structure (has year+month+day or hour+minute+second).
 */
function isNeo4jTemporal(
  v: unknown
): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  // DateTime / LocalDateTime / Date
  if ("year" in o && "month" in o && "day" in o) return true;
  // Time / LocalTime
  if ("hour" in o && "minute" in o && "second" in o) return true;
  return false;
}

function formatNeo4jTemporal(v: Record<string, unknown>): string {
  const pad = (n: unknown) => String(Number(n) || 0).padStart(2, "0");
  const year = v.year;
  const month = v.month;
  const day = v.day;
  const hour = v.hour;
  const minute = v.minute;
  const second = v.second;

  if (year !== undefined && month !== undefined && day !== undefined) {
    const datePart = `${year}-${pad(month)}-${pad(day)}`;
    if (hour !== undefined && minute !== undefined) {
      return `${datePart} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
    }
    return datePart;
  }
  if (hour !== undefined && minute !== undefined) {
    return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
  }
  return String(v);
}

/**
 * Normalize a single value for chart display.
 *
 * - `null` / `undefined` → `null` (callers decide how to handle)
 * - `string` / `number` / `boolean` → returned as-is
 * - `Date` → ISO date string
 * - Neo4j Integer `{low, high}` → number
 * - Neo4j DateTime `{year, month, day, ...}` → formatted string
 * - Other objects → `JSON.stringify` fallback
 */
export function normalizeValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return v;
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? String(v) : v.toISOString().slice(0, 19).replace("T", " ");
  }
  if (isNeo4jInteger(v)) return v.low;
  if (isNeo4jTemporal(v)) return formatNeo4jTemporal(v as Record<string, unknown>);
  // Generic object fallback — stringify to avoid [object Object]
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
