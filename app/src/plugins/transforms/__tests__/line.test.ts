import { describe, it, expect } from "vitest";
import { transformToLineData, validateLineData } from "../line";

describe("transformToLineData", () => {
  it("converts records to line data with x axis", () => {
    const data = [
      { month: "Jan", sales: 100 },
      { month: "Feb", sales: 200 },
    ];
    const result = transformToLineData(data) as Array<{
      x: string;
      sales: number;
    }>;
    expect(result).toHaveLength(2);
    expect(result[0].x).toBe("Jan");
    expect(result[0].sales).toBe(100);
  });

  it("returns empty array for empty data", () => {
    expect(transformToLineData([])).toEqual([]);
  });

  it("returns empty array for single-column data", () => {
    expect(transformToLineData([{ x: 1 }])).toEqual([]);
  });

  it("coerces non-numeric series values to 0", () => {
    const data = [{ x: "Jan", y: "bad" }];
    const result = transformToLineData(data) as Array<{ y: number }>;
    expect(result[0].y).toBe(0);
  });

  it("converts Date objects in x-axis", () => {
    const data = [{ date: new Date("2024-06-01T00:00:00Z"), revenue: 100 }];
    const result = transformToLineData(data) as Array<{ x: unknown }>;
    expect(typeof result[0].x).toBe("string");
    expect(String(result[0].x)).toContain("2024-06-01");
  });

  it("respects column mapping", () => {
    const data = [{ a: 1, b: 2, c: 3 }];
    const result = transformToLineData(data, {
      xAxis: "b",
      yAxis: ["c"],
    }) as Array<Record<string, unknown>>;
    expect(result[0].x).toBe(2);
    expect(result[0].c).toBe(3);
  });
});

describe("validateLineData", () => {
  it("returns null for empty data", () => {
    expect(validateLineData([])).toBeNull();
  });

  it("returns null for 2+ columns", () => {
    expect(validateLineData([{ x: "Jan", y: 100 }])).toBeNull();
  });

  it("returns error for 1-column data", () => {
    const err = validateLineData([{ x: 1 }]);
    expect(err).toBeTruthy();
    expect(err).toContain("Line chart");
  });
});
