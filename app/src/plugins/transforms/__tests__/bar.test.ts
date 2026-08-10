import { describe, it, expect } from "vitest";
import { transformToBarData, validateBarData } from "../../bar/transform";

describe("transformToBarData", () => {
  it("converts array of records to bar data", () => {
    const data = [
      { category: "A", value: 10 },
      { category: "B", value: 20 },
    ];
    const result = transformToBarData(data) as Array<{
      label: string;
      value: number;
    }>;
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("A");
    expect(result[0].value).toBe(10);
  });

  it("handles postgresql { records } wrapper", () => {
    const data = { records: [{ category: "X", value: 5 }] };
    const result = transformToBarData(data) as Array<{ label: string }>;
    expect(result[0].label).toBe("X");
  });

  it("returns empty array for empty input", () => {
    expect(transformToBarData([])).toEqual([]);
  });

  it("returns empty array for single-column data", () => {
    expect(transformToBarData([{ name: "A" }])).toEqual([]);
  });

  it("supports multiple numeric series columns", () => {
    const data = [{ cat: "X", s1: 1, s2: 2 }];
    const result = transformToBarData(data) as Array<Record<string, unknown>>;
    expect(result[0].s1).toBe(1);
    expect(result[0].s2).toBe(2);
  });

  it("maps non-numeric values to null (preserved as gap, not 0)", () => {
    // Previously coerced to 0 — that hid bad data. Returning null lets
    // ECharts render a gap and keeps the missing-vs-zero distinction.
    const data = [{ cat: "X", value: "not-a-number" }];
    const result = transformToBarData(data) as Array<{ value: number | null }>;
    expect(result[0].value).toBeNull();
  });

  it("preserves numeric zero (regression: zero must not become null)", () => {
    const data = [{ cat: "X", value: 0 }];
    const result = transformToBarData(data) as Array<{ value: number | null }>;
    expect(result[0].value).toBe(0);
  });

  it("maps null/undefined cells to null (missing data, not 0)", () => {
    const data = [
      { cat: "A", value: null },
      { cat: "B", value: undefined },
    ];
    const result = transformToBarData(data) as Array<{ value: number | null }>;
    expect(result[0].value).toBeNull();
    expect(result[1].value).toBeNull();
  });

  it("unions series keys across rows so sparse series are not dropped", () => {
    // s2 is absent from the first row — before the fix, transformToBarData
    // would only emit { label, s1 } and silently lose the s2 series.
    const data = [
      { cat: "X", s1: 1 },
      { cat: "Y", s1: 2, s2: 9 },
    ];
    const result = transformToBarData(data) as Array<Record<string, unknown>>;
    expect(result[0].s1).toBe(1);
    expect(result[0].s2).toBeNull();
    expect(result[1].s2).toBe(9);
  });

  it("respects column mapping", () => {
    const data = [{ a: 1, b: 2, c: 3 }];
    const result = transformToBarData(data, {
      xAxis: "b",
      yAxis: ["c"],
    }) as Array<Record<string, unknown>>;
    expect(result[0].label).toBe("2");
    expect(result[0].c).toBe(3);
  });

  it("converts Date objects to formatted strings in labels", () => {
    const data = [{ date: new Date("2024-01-15T10:30:00Z"), value: 42 }];
    const result = transformToBarData(data) as Array<{ label: string }>;
    expect(result[0].label).toContain("2024-01-15");
  });
});

describe("validateBarData", () => {
  it("returns null for empty data", () => {
    expect(validateBarData([])).toBeNull();
  });

  it("returns null for 2+ columns", () => {
    expect(validateBarData([{ cat: "A", value: 10 }])).toBeNull();
  });

  it("returns error for 1-column data", () => {
    const err = validateBarData([{ name: "A" }]);
    expect(err).toBeTruthy();
    expect(err).toContain("Bar chart");
    expect(err).toContain("1 column");
  });
});

// #1400 — the reference dashboard itself demonstrated two stackMode options
// with this query shape, which is how easy it is to fall into.
describe("validateBarData — long format (#1400)", () => {
  const longFormat = [
    { category: "Apparel", series: "delivered", revenue: 100 },
    { category: "Apparel", series: "shipped", revenue: 50 },
    { category: "Home", series: "delivered", revenue: 80 },
  ];

  it("rejects a long-format result naming the offending column", () => {
    const err = validateBarData(longFormat);
    expect(err).not.toBeNull();
    expect(err).toContain("series");
  });

  it("accepts the wide-format equivalent", () => {
    expect(
      validateBarData([
        { category: "Apparel", delivered: 100, shipped: 50 },
        { category: "Home", delivered: 80, shipped: 20 },
      ]),
    ).toBeNull();
  });

  it("accepts long format once the value column is mapped explicitly", () => {
    expect(
      validateBarData(longFormat, { xAxis: "category", yAxis: ["revenue"] }),
    ).toBeNull();
  });
});
