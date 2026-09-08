import { sparseOrders } from "@/__tests__/fixtures/connector-output";
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

describe("connector-shaped fixtures (#1636)", () => {
  const rows = sparseOrders().map((o) => ({
    region: o.status,
    value: o.total,
  }));
  const regions = () =>
    transformToChoroplethData(rows) as Array<{
      name: string;
      value: number | null;
    }>;

  it("keeps a null cell null instead of coercing it to zero", () => {
    expect(regions()[1].value).toBeNull();
  });

  it("reads a numeric string as a number", () => {
    expect(regions()[0].value).toBe(48210.5);
  });
});
