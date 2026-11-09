import { describe, it, expect } from "vitest";
import {
  extractColumnNames,
  resolveStylingConfig,
  buildExportData,
} from "@/lib/widget/card-utils";
import type { StylingConfig } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// extractColumnNames
// ---------------------------------------------------------------------------
describe("extractColumnNames", () => {
  it("returns empty array for non-array input", () => {
    expect(extractColumnNames("not an array")).toEqual([]);
    expect(extractColumnNames(42)).toEqual([]);
    expect(extractColumnNames({})).toEqual([]);
  });

  it("returns empty array for empty array", () => {
    expect(extractColumnNames([])).toEqual([]);
  });

  it("returns empty array when first element is not an object", () => {
    expect(extractColumnNames([42, 43])).toEqual([]);
    expect(extractColumnNames(["str"])).toEqual([]);
  });

  it("returns keys from valid record array", () => {
    const data = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ];
    expect(extractColumnNames(data)).toEqual(["name", "age"]);
  });

  it("returns empty array for null/undefined", () => {
    expect(extractColumnNames(null)).toEqual([]);
    expect(extractColumnNames(undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveStylingConfig
// ---------------------------------------------------------------------------
describe("resolveStylingConfig", () => {
  it("returns undefined when both args are undefined", () => {
    expect(resolveStylingConfig(undefined, undefined)).toBeUndefined();
  });

  it("returns stylingConfig when it is enabled", () => {
    const config: StylingConfig = {
      enabled: true,
      rules: [
        { id: "r1", operator: "<=", value: 50, color: "#00f", target: "color" },
      ],
    };
    expect(resolveStylingConfig(config, undefined)).toBe(config);
  });

  it("returns undefined when stylingConfig is disabled and no legacy thresholds", () => {
    const config: StylingConfig = { enabled: false, rules: [] };
    expect(resolveStylingConfig(config, undefined)).toBeUndefined();
  });

  it("migrates legacy colorThresholds string", () => {
    const legacy = JSON.stringify([{ value: 100, color: "red" }]);
    const result = resolveStylingConfig(undefined, legacy);
    expect(result).toBeDefined();
    expect(result!.enabled).toBe(true);
    expect(result!.rules).toHaveLength(1);
    expect(result!.rules[0].value).toBe(100);
    expect(result!.rules[0].color).toBe("red");
  });

  it("returns undefined for empty/whitespace legacy string", () => {
    expect(resolveStylingConfig(undefined, "")).toBeUndefined();
    expect(resolveStylingConfig(undefined, "   ")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildExportData
// ---------------------------------------------------------------------------
describe("buildExportData", () => {
  it("returns empty array for non-array or empty rawData", () => {
    expect(buildExportData("not-array")).toEqual([]);
    expect(buildExportData(null)).toEqual([]);
    expect(buildExportData(undefined)).toEqual([]);
    expect(buildExportData([])).toEqual([]);
  });

  it("returns rawData as-is", () => {
    const data = [{ a: 1 }, { a: 2 }];
    expect(buildExportData(data)).toBe(data);
  });
});
