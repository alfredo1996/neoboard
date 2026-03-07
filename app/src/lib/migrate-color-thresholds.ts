import type { StylingConfig, StylingRule } from "@/lib/db/schema";

interface LegacyThreshold {
  value: number;
  color: string;
}

/**
 * Migrates legacy `colorThresholds` JSON string to a `StylingConfig`.
 * All legacy thresholds use `<=` operator to preserve existing behavior.
 * Returns undefined if the input is empty, invalid, or has no valid entries.
 */
export function migrateColorThresholds(
  raw: string,
  targetColumn?: string,
): StylingConfig | undefined {
  if (!raw.trim()) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!Array.isArray(parsed)) return undefined;

  const rules: StylingRule[] = parsed
    .filter(
      (t): t is LegacyThreshold =>
        typeof t === "object" &&
        t !== null &&
        typeof t.value === "number" &&
        Number.isFinite(t.value) &&
        typeof t.color === "string",
    )
    .map((t) => ({
      id: crypto.randomUUID(),
      operator: "<=" as const,
      value: t.value,
      color: t.color,
      target: "color" as const,
    }));

  if (rules.length === 0) return undefined;

  return {
    enabled: true,
    rules,
    targetColumn: targetColumn || undefined,
  };
}
