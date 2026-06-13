import { describe, it, expect } from "vitest";
import {
  filterDashboardsByName,
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
