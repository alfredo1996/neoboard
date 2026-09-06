import { describe, it, expect } from "vitest";
import { formatDate } from "../chart-utils";

/**
 * Dates in a chart are pinned to en-US for the same reason numbers are
 * (formatNumber): a shared dashboard should read the same for everyone
 * looking at it, not follow whichever locale each browser happens to carry.
 */
describe("formatDate", () => {
  it("prints en-US 'MMM d, yyyy'", () => {
    expect(formatDate(new Date(2026, 3, 1).getTime())).toBe("Apr 1, 2026");
  });

  it("does not zero-pad the day", () => {
    expect(formatDate(new Date(2026, 11, 9).getTime())).toBe("Dec 9, 2026");
  });

  it("hands back a non-finite value unchanged rather than 'Invalid Date'", () => {
    expect(formatDate(NaN)).toBe("—");
  });
});
