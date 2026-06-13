import { describe, it, expect } from "vitest";
import { dashboardListSubtitle } from "../dashboard-list-subtitle";

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
