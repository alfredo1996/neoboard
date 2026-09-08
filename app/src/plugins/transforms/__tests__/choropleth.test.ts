import { describe, it, expect } from "vitest";
import { transformToChoroplethData } from "../../choropleth/transform";

describe("transformToChoroplethData", () => {
  it("maps a missing value to null, not a fabricated zero (#1655)", () => {
    const result = transformToChoroplethData([
      { country: "France", value: null },
      { country: "Spain", value: 12 },
    ]) as Array<{ name: string; value: number | null }>;
    expect(result[0].value).toBeNull();
    expect(result[1].value).toBe(12);
  });

  it("maps an unparseable value to null rather than zero (#1655)", () => {
    const result = transformToChoroplethData([
      { country: "France", value: "n/a" },
    ]) as Array<{ value: number | null }>;
    expect(result[0].value).toBeNull();
  });

  it("preserves a genuine zero (regression guard: zero must survive)", () => {
    const result = transformToChoroplethData([
      { country: "France", value: 0 },
    ]) as Array<{ value: number | null }>;
    expect(result[0].value).toBe(0);
  });
});
