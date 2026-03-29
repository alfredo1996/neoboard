import type { StylingConfig } from "@/lib/db/schema";
import { migrateColorThresholds } from "@/lib/migrate-color-thresholds";
import { applyTransforms } from "@/lib/data-transforms";
import type { Transform } from "@/lib/data-transforms";

/**
 * Extract column names from raw query result data.
 * Both Neo4j and PostgreSQL return flat Record[] arrays.
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
 * Build export-ready data by applying transforms to raw query results.
 * Returns empty array if data is not valid.
 */
export function buildExportData(
  rawData: unknown,
  transforms: Transform[],
  paramValues?: Record<string, unknown>,
): Record<string, unknown>[] {
  if (!Array.isArray(rawData) || rawData.length === 0) return [];
  if (transforms.length === 0) return rawData as Record<string, unknown>[];
  return applyTransforms(
    rawData as Record<string, unknown>[],
    transforms,
    paramValues,
  );
}
