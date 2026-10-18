import { describe, it, expect } from "vitest";
import {
  dashboardListFilters,
  dashboardListSubtitle,
  dashboardListTotals,
} from "../dashboard-list-subtitle";

describe("dashboardListSubtitle (#1038)", () => {
  it("invites creators/admins to build dashboards", () => {
    expect(dashboardListSubtitle(true)).toBe(
      "Create and manage your data dashboards",
    );
  });

  it("tells read-only users they can only browse shared dashboards", () => {
    expect(dashboardListSubtitle(false)).toBe(
      "Browse the dashboards shared with you",
    );
  });
});

describe("dashboardListFilters (#2253)", () => {
  it("is empty with no search and Only mine off", () => {
    expect(dashboardListFilters("  ", false)).toEqual([]);
  });

  it("reads the trimmed search as 'Name contains' and Only mine as 'Owner is you'", () => {
    expect(dashboardListFilters("  mov ", true)).toEqual([
      { id: "name", label: "Name", operator: "contains", value: "mov" },
      { id: "owner", label: "Owner", value: "you" },
    ]);
  });
});

describe("dashboardListTotals (#2253)", () => {
  it("counts shared dashboards by the API's flag and sums widgets, missing counts as 0", () => {
    expect(
      dashboardListTotals([
        { shared: true, widgetCount: 3 },
        { shared: false, widgetCount: 4 },
        { shared: false },
      ]),
    ).toEqual({ sharedCount: 1, widgetTotal: 7 });
  });

  it("is zero for no list", () => {
    expect(dashboardListTotals(undefined)).toEqual({
      sharedCount: 0,
      widgetTotal: 0,
    });
  });
});
