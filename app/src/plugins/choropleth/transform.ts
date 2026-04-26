import { toRecords, normalizeValue } from "../transforms/shared-utils";

/**
 * Transform raw query results into choropleth data.
 * Expects columns: name/country/region + value/count/total.
 */
export function transformToChoroplethData(data: unknown): unknown {
  const records = toRecords(data);
  if (!records.length) return [];

  const keys = Object.keys(records[0]);
  if (keys.length < 2) return [];

  const nameKey =
    keys.find((k) => /^(name|country|region|state|label)$/i.test(k)) ?? keys[0];

  const valueKey =
    keys.find(
      (k) =>
        k !== nameKey && /^(value|count|total|population|gdp|amount)$/i.test(k),
    ) ??
    keys.find((k) => k !== nameKey) ??
    keys[1];

  return records
    .map((row) => ({
      name: String(normalizeValue(row[nameKey]) ?? ""),
      value: Number(row[valueKey]) || 0,
    }))
    .filter((d) => d.name);
}
