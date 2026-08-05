import { describe, it, expect } from "vitest";
import { transformToLineData, validateLineData } from "../../line/transform";

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

  it("maps non-numeric series values to null (preserved as gap, not 0)", () => {
    // Previously coerced to 0 — that hid bad data. Returning null lets
    // ECharts render a gap and keeps the missing-vs-zero distinction.
    const data = [{ x: "Jan", y: "bad" }];
    const result = transformToLineData(data) as Array<{ y: number | null }>;
    expect(result[0].y).toBeNull();
  });

  it("preserves numeric zero (regression: zero must not become null)", () => {
    const data = [{ x: "Jan", y: 0 }];
    const result = transformToLineData(data) as Array<{ y: number | null }>;
    expect(result[0].y).toBe(0);
  });

  it("maps null/undefined cells to null (missing data, not 0)", () => {
    const data = [
      { x: "Jan", y: null },
      { x: "Feb", y: undefined },
    ];
    const result = transformToLineData(data) as Array<{ y: number | null }>;
    expect(result[0].y).toBeNull();
    expect(result[1].y).toBeNull();
  });

  it("unions series keys across rows so sparse series are not dropped", () => {
    // y2 only appears in the second row — before the fix, transformToLineData
    // would only emit { x, y1 } and silently lose the y2 series.
    const data = [
      { x: "Jan", y1: 1 },
      { x: "Feb", y1: 2, y2: 9 },
    ];
    const result = transformToLineData(data) as Array<Record<string, unknown>>;
    expect(result[0].y1).toBe(1);
    expect(result[0].y2).toBeNull();
    expect(result[1].y2).toBe(9);
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

// #1400 — line was the worse of the two: one revenue line drawn across
// duplicated x values, interleaving delivered -> shipped -> delivered, which
// reads as a violently spiky time series but is pure artifact.
describe("validateLineData — long format (#1400)", () => {
  const longFormat = [
    { week: "2026-01-05", series: "delivered", revenue: 100 },
    { week: "2026-01-05", series: "shipped", revenue: 50 },
    { week: "2026-01-12", series: "delivered", revenue: 80 },
  ];

  it("rejects a long-format result naming the offending column", () => {
    const err = validateLineData(longFormat);
    expect(err).not.toBeNull();
    expect(err).toContain("series");
  });

  it("accepts the wide-format equivalent", () => {
    expect(
      validateLineData([
        { week: "2026-01-05", delivered: 100, shipped: 50 },
        { week: "2026-01-12", delivered: 80, shipped: 20 },
      ]),
    ).toBeNull();
  });

  it("accepts long format once the value column is mapped explicitly", () => {
    expect(
      validateLineData(longFormat, { xAxis: "week", yAxis: ["revenue"] }),
    ).toBeNull();
  });
});
