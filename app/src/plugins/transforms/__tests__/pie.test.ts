import { sparseOrders } from "@/__tests__/fixtures/connector-output";
import { describe, it, expect } from "vitest";
import { transformToPieData, validatePieData } from "../../pie/transform";

describe("transformToPieData", () => {
  it("converts records to {name, value} pairs", () => {
    const data = [
      { label: "Apples", count: 30 },
      { label: "Oranges", count: 70 },
    ];
    const result = transformToPieData(data) as Array<{
      name: string;
      value: number;
    }>;
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "Apples", value: 30 });
  });

  it("returns empty array for empty input", () => {
    expect(transformToPieData([])).toEqual([]);
  });

  it("returns empty array for single-column data", () => {
    expect(transformToPieData([{ label: "A" }])).toEqual([]);
  });

  it("coerces non-numeric values to 0", () => {
    const data = [{ label: "X", count: "bad" }];
    const result = transformToPieData(data) as Array<{ value: number }>;
    expect(result[0].value).toBe(0);
  });

  it("respects column mapping", () => {
    const data = [{ a: "Cat", b: 10, c: 20 }];
    const result = transformToPieData(data, {
      xAxis: "a",
      yAxis: ["c"],
    }) as Array<{ name: string; value: number }>;
    expect(result[0].name).toBe("Cat");
    expect(result[0].value).toBe(20);
  });
});

describe("validatePieData", () => {
  it("returns null for empty data", () => {
    expect(validatePieData([])).toBeNull();
  });

  it("returns null for 2-column data", () => {
    expect(validatePieData([{ name: "A", value: 10 }])).toBeNull();
  });

  it("returns error for 1-column data", () => {
    const err = validatePieData([{ name: "A" }]);
    expect(err).toBeTruthy();
    expect(err).toContain("Pie chart");
  });
});

describe("connector-shaped fixtures (#1636)", () => {
  const rows = sparseOrders().map((o) => ({ name: o.status, value: o.total }));
  const slices = () =>
    transformToPieData(rows) as Array<{ name: string; value: number }>;

  it("reads a numeric string as a number", () => {
    expect(slices()[0].value).toBe(48210.5);
  });

  it("gives a null cell a zero-area slice, by contract", () => {
    // A pie has no gap to draw: a null total is a slice with no area, and the
    // name survives so the legend still lists it. This is the contract as
    // shipped; changing it should change this assertion knowingly.
    expect(slices()[1]).toEqual({ name: "pending", value: 0 });
  });
});
