/**
 * Map chart data transform and validator.
 */

import { toRecords, normalizeValue } from "../transforms/shared-utils";

/**
 * Anchored, not substring. `/lat/i` matched "population" and "platform";
 * `/lo?ng?/i` matched "belongs" and "colony" — and the first key to match
 * won, so a query returning name, population, latitude, longitude plotted
 * population against longitude without a word of complaint.
 */
const LAT_RE = /^(lat|latitude)$/i;
const LNG_RE = /^(lng|lon|long|longitude)$/i;
const LABEL_RE = /^(name|label|title)$/i;

/**
 * The column name without its Cypher qualifier: `RETURN c.latitude` names the
 * column "c.latitude", and an anchored match against the whole key would
 * reject it. Matching the last segment keeps unaliased queries working while
 * still refusing "c.population".
 */
const bareName = (key: string) => key.slice(key.lastIndexOf(".") + 1);

export interface MapColumns {
  latKey?: string;
  lngKey?: string;
  labelKey?: string;
  keys: string[];
}

/** Which column means what, resolved once from the first row. */
export function resolveMapColumns(
  records: Record<string, unknown>[],
): MapColumns {
  const keys = Object.keys(records[0] ?? {});
  return {
    latKey: keys.find((k) => LAT_RE.test(bareName(k))),
    lngKey: keys.find((k) => LNG_RE.test(bareName(k))),
    labelKey: keys.find((k) => LABEL_RE.test(bareName(k))),
    keys,
  };
}

/**
 * A coordinate, or NaN. `Number()` turns null, undefined and "" into 0, which
 * put every row with a missing coordinate on Null Island — a real-looking
 * marker in the Gulf of Guinea. NaN reaches MapChart's finite filter instead,
 * which skips the row and counts it in the "N rows skipped" notice.
 *
 * Numeric strings are accepted because node-pg returns NUMERIC as a string.
 */
function toCoordinate(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return NaN;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/**
 * Transform to map format: extract lat/lon/label from records.
 */
export function transformToMapData(data: unknown): unknown {
  const records = toRecords(data);
  if (!records.length) return [];

  const { latKey, lngKey, labelKey } = resolveMapColumns(records);
  if (!latKey || !lngKey) return [];

  // No row prefilter: it required at least one JS number in the row, so a
  // PostgreSQL result of two NUMERIC columns — both strings — produced no
  // markers at all.
  return records.map((r, i) => {
    const label = labelKey ? normalizeValue(r[labelKey]) : undefined;
    return {
      id: String(i),
      lat: toCoordinate(r[latKey]),
      lng: toCoordinate(r[lngKey]),
      label: label == null ? undefined : String(label),
      // The raw row rides along so a click action can name any query column
      // the editor offered (#1589).
      properties: r,
    };
  });
}

/**
 * Validates raw data shape for map charts.
 * Returns null if valid or empty, error string if rows exist but have no lat/lng columns.
 */
export function validateMapData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) return null;

  const { latKey, lngKey, keys } = resolveMapColumns(records);
  if (!latKey || !lngKey) {
    return `Map needs a latitude and a longitude column. Found: ${keys.join(", ")}. Name them lat or latitude, and lng, lon, long or longitude.`;
  }
  return null;
}
