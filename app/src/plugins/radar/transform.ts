/**
 * Radar chart data transform.
 */

import {
  toRecords,
  normalizeValue,
  toSeriesNumber,
} from "../transforms/shared-utils";

/**
 * Transform to Radar chart format: { indicators: [{ name, max }], series: [{ name, values }] }
 * Handles:
 * 1. Records with indicator/value/max columns (optionally a series/group column).
 * 2. Flat tabular records where column names become indicators.
 */
export function transformToRadarData(data: unknown): unknown {
  const records = toRecords(data);
  if (!records.length) return { indicators: [], series: [] };

  const keys = Object.keys(records[0]);
  const indicatorKey = keys.find((k) =>
    /^(indicator|axis|dimension|category)$/i.test(k),
  );
  const valueKey = keys.find(
    (k) => /^(value|score)$/i.test(k) && k !== indicatorKey,
  );
  const maxKey = keys.find((k) => /^(max|maximum)$/i.test(k));
  const seriesKey = keys.find(
    (k) =>
      /^(series|group|name|label)$/i.test(k) &&
      k !== indicatorKey &&
      k !== valueKey &&
      k !== maxKey,
  );

  if (indicatorKey && valueKey) {
    // Long-format: one row per (series, indicator) combination
    const indicatorMaxFromData = new Map<string, number>(); // name -> observed max value
    const indicatorExplicitMax = new Map<string, number>(); // name -> explicit max from data
    const seriesMap = new Map<string, Map<string, number | null>>(); // seriesName -> { indicator -> value | null }

    for (const r of records) {
      const indName = String(normalizeValue(r[indicatorKey]) ?? "");
      const val = toSeriesNumber(r[valueKey]);
      const serName = seriesKey
        ? String(normalizeValue(r[seriesKey]) ?? "Default")
        : "Default";

      if (maxKey) {
        const explicitMax = Number(r[maxKey]);
        if (
          Number.isFinite(explicitMax) &&
          explicitMax > 0 &&
          !indicatorExplicitMax.has(indName)
        ) {
          indicatorExplicitMax.set(indName, explicitMax);
        }
      }
      // An indicator seen only through null cells still needs an axis — the
      // indicator list below is built from this map's keys, so skipping the
      // set() would delete a side of the polygon (#1655).
      indicatorMaxFromData.set(
        indName,
        Math.max(indicatorMaxFromData.get(indName) ?? 0, val ?? 0),
      );
      if (!seriesMap.has(serName)) seriesMap.set(serName, new Map());
      seriesMap.get(serName)!.set(indName, val);
    }

    // Use explicit max if provided, otherwise use a single global max across all
    // indicators so relative magnitudes are visible (e.g. 172 vs 9).
    const indicatorEntries = Array.from(indicatorMaxFromData.keys());
    const globalMax =
      Math.ceil(Math.max(...indicatorMaxFromData.values()) * 1.1) || 100;
    const indicators = indicatorEntries.map((name) => ({
      name,
      max: indicatorExplicitMax.get(name) ?? globalMax,
    }));
    const series = Array.from(seriesMap.entries()).map(([name, valMap]) => ({
      name,
      // `?? null` collapses both "no row for this axis" and "row with a null
      // cell" to the same missing marker — neither is a measurement of zero.
      values: indicators.map((ind) => valMap.get(ind.name) ?? null),
    }));

    return { indicators, series };
  }

  // Wide-format: each column is an indicator, each row is a series
  // Use a single global max so all axes share the same scale
  let wideGlobalMax = 0;
  for (const r of records) {
    for (const k of keys) {
      const v = toSeriesNumber(r[k]);
      if (v !== null && v > wideGlobalMax) wideGlobalMax = v;
    }
  }
  const wideMax = Math.ceil(wideGlobalMax * 1.1) || 100;
  const indicators = keys.map((k) => ({
    name: k,
    max: wideMax,
  }));
  const series = records.map((r, i) => ({
    name: String(i + 1),
    values: keys.map((k) => toSeriesNumber(r[k])),
  }));

  return { indicators, series };
}
