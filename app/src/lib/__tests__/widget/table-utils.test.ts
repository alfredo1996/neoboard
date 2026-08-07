import { describe, it, expect } from "vitest";
import { parseGroupByColumns } from "@/lib/widget/table-utils";

describe("parseGroupByColumns", () => {
  it("returns undefined when grouping is disabled", () => {
    expect(parseGroupByColumns(false, "country,city")).toBeUndefined();
  });

  it("returns undefined when groupBy is empty string", () => {
    expect(parseGroupByColumns(true, "")).toBeUndefined();
  });

  it("returns undefined when groupBy is whitespace only", () => {
    expect(parseGroupByColumns(true, "   ")).toBeUndefined();
  });

  it("parses a single column", () => {
    expect(parseGroupByColumns(true, "country")).toEqual(["country"]);
  });

  it("parses multiple comma-separated columns", () => {
    expect(parseGroupByColumns(true, "country,city")).toEqual([
      "country",
      "city",
    ]);
  });

  it("trims whitespace around column names", () => {
    expect(parseGroupByColumns(true, " country , city , region ")).toEqual([
      "country",
      "city",
      "region",
    ]);
  });

  it("filters out empty entries from trailing commas", () => {
    expect(parseGroupByColumns(true, "country,,city,")).toEqual([
      "country",
      "city",
    ]);
  });

  it("handles non-string groupBy gracefully", () => {
    // Runtime safety: groupBy might come from JSON settings as number/undefined
    expect(
      parseGroupByColumns(true, undefined as unknown as string),
    ).toBeUndefined();
    expect(parseGroupByColumns(true, 123 as unknown as string)).toBeUndefined();
  });

  // #1395 — the editor writes a comma-separated string, but seeded layouts,
  // imports and NeoDash conversions carry an array. `typeof groupBy === "string"
  // ? groupBy : ""` turned the array into "" and grouping was dropped with no
  // error, so individual rows read as group totals. Three seeded Chart
  // Reference tiles hold `groupBy: ["region"]` and rendered flat.
  describe("array form (#1395)", () => {
    it("accepts a single-element array", () => {
      expect(parseGroupByColumns(true, ["region"])).toEqual(["region"]);
    });

    it("preserves order, which is the nesting hierarchy", () => {
      expect(parseGroupByColumns(true, ["region", "city"])).toEqual([
        "region",
        "city",
      ]);
    });

    it("returns undefined for an empty array", () => {
      expect(parseGroupByColumns(true, [])).toBeUndefined();
    });

    it("returns undefined for an array when grouping is disabled", () => {
      expect(parseGroupByColumns(false, ["region"])).toBeUndefined();
    });

    it("trims and drops blank entries", () => {
      expect(parseGroupByColumns(true, [" region ", "", "  ", "city"])).toEqual(
        ["region", "city"],
      );
    });

    it("ignores non-string entries rather than stringifying them", () => {
      expect(
        parseGroupByColumns(true, ["region", 7, null] as unknown as string[]),
      ).toEqual(["region"]);
    });

    it("returns undefined when an array holds nothing usable", () => {
      expect(
        parseGroupByColumns(true, [null, ""] as unknown as string[]),
      ).toBeUndefined();
    });
  });
});
