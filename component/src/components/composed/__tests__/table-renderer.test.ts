import { describe, it, expect } from "vitest";
import { parseGroupByColumns } from "../table-renderer";

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
    expect(
      parseGroupByColumns(true, undefined as unknown as string),
    ).toBeUndefined();
    expect(parseGroupByColumns(true, 123 as unknown as string)).toBeUndefined();
  });
});
