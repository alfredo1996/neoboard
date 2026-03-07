/** A color threshold entry: value below which the given color applies. */
export interface ColorThreshold {
  value: number;
  color: string;
}

/** Parse a JSON string of ColorThreshold entries; returns [] on error. */
export function parseColorThresholds(raw: string): ColorThreshold[] {
  if (!raw.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is ColorThreshold =>
        typeof t === "object" &&
        t !== null &&
        "value" in t &&
        "color" in t &&
        typeof (t as ColorThreshold).value === "number" &&
        Number.isFinite((t as ColorThreshold).value) &&
        typeof (t as ColorThreshold).color === "string",
    );
  } catch {
    return [];
  }
}

/** Returns the first matching threshold color for a numeric value, or undefined. */
export function resolveThresholdColor(
  numericValue: number,
  thresholds: ColorThreshold[],
): string | undefined {
  const sorted = [...thresholds].sort((a, b) => a.value - b.value);
  for (const t of sorted) {
    if (numericValue <= t.value) return t.color;
  }
  return undefined;
}
