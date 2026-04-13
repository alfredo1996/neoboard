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

  it("coerces non-numeric values to 0", () => {
    const data = [{ cat: "X", value: "not-a-number" }];
    const result = transformToBarData(data) as Array<{ value: number }>;
    expect(result[0].value).toBe(0);
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
