/**
 * Radar chart data transform.
 */

import { toRecords, normalizeValue } from "../transforms/shared-utils";

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
    const seriesMap = new Map<string, Map<string, number>>(); // seriesName -> { indicator -> value }

    for (const r of records) {
      const indName = String(normalizeValue(r[indicatorKey]) ?? "");
      const val = Number(r[valueKey]) || 0;
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
      indicatorMaxFromData.set(
        indName,
        Math.max(indicatorMaxFromData.get(indName) ?? 0, val),
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
      values: indicators.map((ind) => valMap.get(ind.name) ?? 0),
    }));

    return { indicators, series };
  }

  // Wide-format: each column is an indicator, each row is a series
  // Use a single global max so all axes share the same scale
  let wideGlobalMax = 0;
  for (const r of records) {
    for (const k of keys) {
      const v = Number(r[k]) || 0;
      if (v > wideGlobalMax) wideGlobalMax = v;
    }
  }
  const wideMax = Math.ceil(wideGlobalMax * 1.1) || 100;
  const indicators = keys.map((k) => ({
    name: k,
    max: wideMax,
  }));
  const series = records.map((r, i) => ({
    name: String(i + 1),
    values: keys.map((k) => Number(r[k]) || 0),
  }));

  return { indicators, series };
}
