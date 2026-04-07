/**
 * Map chart data transform and validator.
 */

import { toRecords } from "./shared";

/**
 * Transform to map format: extract lat/lon/label from records.
 */
export function transformToMapData(data: unknown): unknown {
  const records = toRecords(data);
  return records
    .filter((r) => {
      const vals = Object.values(r);
      return vals.some((v) => typeof v === "number");
    })
    .map((r, i) => {
      const keys = Object.keys(r);
      const latKey = keys.find((k) => /lat/i.test(k));
      const lngKey = keys.find((k) => /lo?ng?/i.test(k));
      const labelKey = keys.find((k) => /name|label|title/i.test(k));

      if (latKey && lngKey) {
        return {
          id: String(i),
          lat: Number(r[latKey]),
          lng: Number(r[lngKey]),
          label: labelKey ? String(r[labelKey]) : undefined,
          properties: r,
        };
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Validates raw data shape for map charts.
 * Returns null if valid or empty, error string if rows exist but have no lat/lng columns.
 */
export function validateMapData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) return null;
  const keys = Object.keys(records[0]);
  const hasLat = keys.some((k) => /lat/i.test(k));
  const hasLng = keys.some((k) => /lo?ng?/i.test(k));
  if (!hasLat || !hasLng)
    return "Map chart requires columns with latitude and longitude values. No columns matching lat/lng patterns were found. Use column names containing 'lat' and 'lng'/'lon'. Example: `SELECT name, latitude, longitude FROM ...`";
  return null;
}
