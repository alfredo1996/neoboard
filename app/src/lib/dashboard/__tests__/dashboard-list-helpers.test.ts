import { describe, it, expect } from "vitest";
import {
  dashboardTagOptions,
  filterDashboardsByName,
  filterDashboardsByTag,
  isDuplicateDashboardName,
} from "../dashboard-list-helpers";

const LIST = [
  { name: "Sales Overview" },
  { name: "Movie Analytics" },
  { name: "sales detail" },
];

describe("filterDashboardsByName (#1048)", () => {
  it("returns all dashboards for an empty query", () => {
    expect(filterDashboardsByName(LIST, "   ")).toHaveLength(3);
  });

  it("filters by case-insensitive name substring", () => {
    const r = filterDashboardsByName(LIST, "sales");
    expect(r.map((d) => d.name)).toEqual(["Sales Overview", "sales detail"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterDashboardsByName(LIST, "zzz")).toEqual([]);
  });
});

describe("isDuplicateDashboardName (#1048)", () => {
  it("detects a duplicate name regardless of case/whitespace", () => {
    expect(isDuplicateDashboardName("  movie analytics ", LIST)).toBe(true);
  });

  it("returns false for a unique name", () => {
    expect(isDuplicateDashboardName("Brand New", LIST)).toBe(false);
  });

  it("returns false for an empty name", () => {
    expect(isDuplicateDashboardName("   ", LIST)).toBe(false);
  });
});

describe("dashboard tags on the list (#1692)", () => {
  const TAGGED = [
    { name: "a", tags: ["Sales", "finance"] },
    { name: "b", tags: ["sales"] },
    { name: "c", tags: [] },
    { name: "d" },
  ];

  it("lists each tag in use once, ignoring case, A to Z, with its first spelling", () => {
    expect(dashboardTagOptions(TAGGED)).toEqual([
      { key: "finance", label: "finance" },
      { key: "sales", label: "Sales" },
    ]);
  });

  it("has no options when no dashboard has a tag", () => {
    expect(dashboardTagOptions([{ tags: [] }, {}])).toEqual([]);
  });

  it("filters ignoring case, and an empty key keeps everything", () => {
    expect(filterDashboardsByTag(TAGGED, "sales").map((d) => d.name)).toEqual([
      "a",
      "b",
    ]);
    expect(filterDashboardsByTag(TAGGED, "")).toHaveLength(4);
  });
});
