import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime } from "../chart-utils";

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

/**
 * The gantt slider's handle labels (#1686): a fixed-width shape that reads
 * the same whether the range is eight hours or eight months, in local time
 * like the axis ticks it sits under.
 */
describe("formatDateTime", () => {
  it("prints 'yyyy-MM-dd HH:mm', zero-padded", () => {
    expect(formatDateTime(new Date(2026, 3, 1, 9, 5).getTime())).toBe(
      "2026-04-01 09:05",
    );
  });

  it("keeps two digits past noon and in December", () => {
    expect(formatDateTime(new Date(2026, 11, 25, 23, 59).getTime())).toBe(
      "2026-12-25 23:59",
    );
  });

  it("hands back a non-finite value rather than 'NaN-NaN-NaN'", () => {
    expect(formatDateTime(NaN)).toBe("—");
  });
});
