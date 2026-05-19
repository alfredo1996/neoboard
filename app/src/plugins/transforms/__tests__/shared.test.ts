import { describe, it, expect } from "vitest";
import {
  toRecords,
  resolveLabelKey,
  resolveValueKeys,
  collectAllKeys,
  toSeriesNumber,
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

  it("returns null for non-numeric strings instead of silently giving 0", () => {
    expect(toSeriesNumber("not-a-number")).toBeNull();
    expect(toSeriesNumber("NaN")).toBeNull();
  });

  it("returns null for Infinity / NaN", () => {
    expect(toSeriesNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toSeriesNumber(Number.NaN)).toBeNull();
  });
});
