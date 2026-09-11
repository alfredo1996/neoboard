import { describe, it, expect } from "vitest";
import { deleteDashboardToast } from "../delete-dashboard-toast";

describe("deleteDashboardToast (#1750)", () => {
  it("confirms a normal delete", () => {
    expect(deleteDashboardToast(false)).toEqual({
      title: "Dashboard deleted",
      description: "The dashboard has been removed.",
    });
  });

  it("says the dashboard was already deleted elsewhere on a 404", () => {
    expect(deleteDashboardToast(true)).toEqual({
      title: "Dashboard already deleted",
      description: "It had been removed elsewhere.",
    });
  });
});
