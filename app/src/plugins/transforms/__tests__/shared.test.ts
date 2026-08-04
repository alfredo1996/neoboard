import { describe, it, expect } from "vitest";
import {
  toRecords,
  resolveLabelKey,
  resolveValueKeys,
  collectAllKeys,
  toSeriesNumber,
  validateNumericValueColumns,
} from "../shared-utils";

describe("toRecords", () => {
  it("returns array data unchanged", () => {
    const data = [{ a: 1 }];
    expect(toRecords(data)).toEqual(data);
  });

  it("unwraps { records } wrapper from PostgreSQL", () => {
    const records = [{ a: 1 }];
    expect(toRecords({ records })).toEqual(records);
  });

  it("returns empty array for null", () => {
    expect(toRecords(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(toRecords(undefined)).toEqual([]);
  });

  it("returns empty array for a plain object without records key", () => {
    expect(toRecords({ foo: "bar" })).toEqual([]);
  });

  it("returns empty array for empty array", () => {
    expect(toRecords([])).toEqual([]);
  });
});

describe("resolveLabelKey", () => {
  it("returns first key when no mapping", () => {
    expect(resolveLabelKey(["a", "b", "c"])).toBe("a");
  });

  it("returns mapped xAxis when valid", () => {
    expect(resolveLabelKey(["a", "b", "c"], { xAxis: "b" })).toBe("b");
  });

  it("falls back to first key when xAxis not in keys", () => {
    expect(resolveLabelKey(["a", "b"], { xAxis: "z" })).toBe("a");
  });
});

describe("resolveValueKeys", () => {
  it("returns all non-label keys when no mapping", () => {
    expect(resolveValueKeys(["a", "b", "c"], "a")).toEqual(["b", "c"]);
  });

  it("returns mapped yAxis when valid", () => {
    expect(resolveValueKeys(["a", "b", "c"], "a", { yAxis: ["c"] })).toEqual([
      "c",
    ]);
  });

  it("falls back when yAxis columns not in keys", () => {
    expect(resolveValueKeys(["a", "b"], "a", { yAxis: ["z"] })).toEqual(["b"]);
  });

  it("returns empty yAxis array as fallback", () => {
    expect(resolveValueKeys(["a", "b"], "a", { yAxis: [] })).toEqual(["b"]);
  });
});

describe("collectAllKeys", () => {
  it("returns the union of keys across all rows in first-seen order", () => {
    expect(
      collectAllKeys([
        { a: 1, b: 2 },
        { b: 3, c: 4 },
        { a: 5, d: 6 },
      ]),
    ).toEqual(["a", "b", "c", "d"]);
  });

  it("returns an empty array for an empty record list", () => {
    expect(collectAllKeys([])).toEqual([]);
  });

  it("does not duplicate keys that appear in multiple rows", () => {
    expect(collectAllKeys([{ a: 1 }, { a: 2 }, { a: 3 }])).toEqual(["a"]);
  });
});

describe("toSeriesNumber", () => {
  it("preserves finite numbers including zero and negatives", () => {
    expect(toSeriesNumber(0)).toBe(0);
    expect(toSeriesNumber(42)).toBe(42);
    expect(toSeriesNumber(-3.14)).toBe(-3.14);
  });

  it("parses numeric strings", () => {
    expect(toSeriesNumber("10")).toBe(10);
    expect(toSeriesNumber("0")).toBe(0);
    expect(toSeriesNumber("-2.5")).toBe(-2.5);
  });

  it("returns null for null, undefined and empty string (missing data)", () => {
    expect(toSeriesNumber(null)).toBeNull();
    expect(toSeriesNumber(undefined)).toBeNull();
    expect(toSeriesNumber("")).toBeNull();
  });

  it("returns null for whitespace-only strings (Number(' ') === 0 otherwise)", () => {
    // Without this, Number("   ") returns 0 and the value silently masquerades
    // as a real zero on the chart.
    expect(toSeriesNumber("   ")).toBeNull();
    expect(toSeriesNumber("\t")).toBeNull();
    expect(toSeriesNumber("\n")).toBeNull();
  });

  it("returns null for non-numeric strings instead of silently giving 0", () => {
    expect(toSeriesNumber("not-a-number")).toBeNull();
    expect(toSeriesNumber("NaN")).toBeNull();
  });

  it("returns null for Infinity / NaN", () => {
    expect(toSeriesNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toSeriesNumber(Number.NaN)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #1400 — long-format rejection
// ---------------------------------------------------------------------------

describe("validateNumericValueColumns (#1400)", () => {
  // The natural shape of `GROUP BY a, b`. Every non-label column was treated
  // as a value series, so `series` became a series of its own whose cells all
  // coerced to null — a ghost legend entry, duplicated x labels, and a chart
  // that looked like data.
  const longFormat = [
    { category: "Apparel", series: "delivered", revenue: 100 },
    { category: "Apparel", series: "shipped", revenue: 50 },
    { category: "Home", series: "delivered", revenue: 80 },
  ];

  it("rejects a value column whose every non-null cell is non-numeric", () => {
    const msg = validateNumericValueColumns(longFormat, "Bar chart");
    expect(msg).not.toBeNull();
  });

  it("names the offending column", () => {
    const msg = validateNumericValueColumns(longFormat, "Bar chart");
    expect(msg).toContain("series");
  });

  it("accepts a wide-format result", () => {
    const wide = [
      { category: "Apparel", delivered: 100, shipped: 50 },
      { category: "Home", delivered: 80, shipped: 20 },
    ];
    expect(validateNumericValueColumns(wide, "Bar chart")).toBeNull();
  });

  it("accepts numeric strings", () => {
    const rows = [
      { month: "Jan", revenue: "100" },
      { month: "Feb", revenue: "200" },
    ];
    expect(validateNumericValueColumns(rows, "Line chart")).toBeNull();
  });

  // An all-null column is a legitimate sparse series — what a LEFT JOIN
  // produces — and `collectAllKeys` exists specifically to keep it. Rejecting
  // it would re-break the case the union-of-keys logic was written for.
  it("accepts an entirely null column as a sparse series", () => {
    const sparse = [
      { month: "Jan", revenue: 100, forecast: null },
      { month: "Feb", revenue: 200, forecast: null },
    ];
    expect(validateNumericValueColumns(sparse, "Line chart")).toBeNull();
  });

  it("accepts a column that is only partly populated", () => {
    const partial = [
      { month: "Jan", revenue: 100, forecast: null },
      { month: "Feb", revenue: 200, forecast: 250 },
    ];
    expect(validateNumericValueColumns(partial, "Line chart")).toBeNull();
  });

  it("respects an explicit yAxis mapping and ignores unmapped text columns", () => {
    // The user mapped the value column themselves; `series` is not plotted,
    // so it must not be flagged.
    const msg = validateNumericValueColumns(longFormat, "Bar chart", {
      xAxis: "category",
      yAxis: ["revenue"],
    });
    expect(msg).toBeNull();
  });

  it("flags an explicitly mapped column that is non-numeric", () => {
    const msg = validateNumericValueColumns(longFormat, "Bar chart", {
      xAxis: "category",
      yAxis: ["series"],
    });
    expect(msg).toContain("series");
  });

  it("names every offending column when there is more than one", () => {
    const rows = [
      { category: "A", series: "x", label: "p", revenue: 1 },
      { category: "B", series: "y", label: "q", revenue: 2 },
    ];
    const msg = validateNumericValueColumns(rows, "Bar chart") ?? "";
    expect(msg).toContain("series");
    expect(msg).toContain("label");
  });

  it("returns null for empty data", () => {
    expect(validateNumericValueColumns([], "Bar chart")).toBeNull();
  });
});
