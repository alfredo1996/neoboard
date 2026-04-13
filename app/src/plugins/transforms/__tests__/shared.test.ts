import { describe, it, expect } from "vitest";
import { toRecords, resolveLabelKey, resolveValueKeys } from "../shared-utils";

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
