import { describe, it, expect } from "vitest";
import { parseIsoDate, formatIsoDate } from "../date-utils";

describe("parseIsoDate", () => {
  it("parses a valid YYYY-MM-DD string", () => {
    const date = parseIsoDate("2025-06-15");
    expect(date).toBeInstanceOf(Date);
    expect(date!.getFullYear()).toBe(2025);
    expect(date!.getMonth()).toBe(5); // June = 5
    expect(date!.getDate()).toBe(15);
  });

  it("returns undefined for empty string", () => {
    expect(parseIsoDate("")).toBeUndefined();
  });

  it("returns undefined for malformed string", () => {
    expect(parseIsoDate("not-a-date")).toBeUndefined();
    expect(parseIsoDate("2025/06/15")).toBeUndefined();
    expect(parseIsoDate("06-15-2025")).toBeUndefined();
  });

  it("returns undefined for partial date", () => {
    expect(parseIsoDate("2025-06")).toBeUndefined();
    expect(parseIsoDate("2025")).toBeUndefined();
  });

  it("returns undefined for overflow dates that silently roll over", () => {
    // new Date(2024, 1, 30) rolls to Mar 1 — must be rejected, not accepted.
    expect(parseIsoDate("2024-02-30")).toBeUndefined();
    expect(parseIsoDate("2025-02-29")).toBeUndefined(); // not a leap year
    expect(parseIsoDate("2025-13-01")).toBeUndefined(); // month 13
    expect(parseIsoDate("2025-04-31")).toBeUndefined(); // April has 30 days
    expect(parseIsoDate("2025-00-10")).toBeUndefined(); // month 0
  });

  it("accepts a valid leap day", () => {
    const date = parseIsoDate("2024-02-29");
    expect(date).toBeInstanceOf(Date);
    expect(date!.getMonth()).toBe(1);
    expect(date!.getDate()).toBe(29);
  });

  it("parses dates in local time (not UTC)", () => {
    const date = parseIsoDate("2025-01-01");
    // getDate() returns local day — should be 1, not 31 (which would happen with UTC midnight shift)
    expect(date!.getDate()).toBe(1);
  });
});

describe("formatIsoDate", () => {
  it("formats a Date as YYYY-MM-DD using local time", () => {
    const date = new Date(2025, 5, 15); // June 15, 2025
    expect(formatIsoDate(date)).toBe("2025-06-15");
  });

  it("zero-pads single-digit months and days", () => {
    const date = new Date(2025, 0, 5); // Jan 5, 2025
    expect(formatIsoDate(date)).toBe("2025-01-05");
  });

  it("handles December 31st correctly", () => {
    const date = new Date(2025, 11, 31); // Dec 31, 2025
    expect(formatIsoDate(date)).toBe("2025-12-31");
  });
});
