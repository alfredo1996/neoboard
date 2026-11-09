import type { StylingConfig } from "@/lib/db/schema";
import { migrateColorThresholds } from "@/lib/dashboard/migrate-color-thresholds";

/**
 * Extract column names from raw query result data.
 * Every connector returns a flat row array — the SDK's value contract (#1904).
 */
export function extractColumnNames(data: unknown): string[] {
  const records = Array.isArray(data) ? data : [];
  if (!records.length) return [];
  const first = records[0] as Record<string, unknown> | undefined;
  if (!first || typeof first !== "object") return [];
  return Object.keys(first);
}

/**
 * Resolve styling config from new format or legacy colorThresholds.
 */
export function resolveStylingConfig(
  stylingConfig?: StylingConfig,
  colorThresholds?: string,
): StylingConfig | undefined {
  if (stylingConfig?.enabled) return stylingConfig;
  if (typeof colorThresholds === "string" && colorThresholds.trim()) {
    return migrateColorThresholds(colorThresholds);
  }
  return undefined;
}

/**
 * Build export-ready data from raw query results.
 * Returns empty array if data is not valid.
 */
export function buildExportData(rawData: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rawData) || rawData.length === 0) return [];
  return rawData as Record<string, unknown>[];
}
