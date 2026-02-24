import { describe, it, expect, vi, afterEach } from "vitest";
import { toIso, addDays, resolveRelativePreset } from "../date-utils";

// ── toIso ──────────────────────────────────────────────────────────────────────

describe("toIso", () => {
  it("formats a Date to YYYY-MM-DD", () => {
    expect(toIso(new Date(2025, 0, 15))).toBe("2025-01-15");
  });

  it("zero-pads single-digit months", () => {
    expect(toIso(new Date(2025, 2, 5))).toBe("2025-03-05");
  });

  it("zero-pads single-digit days", () => {
    expect(toIso(new Date(2025, 11, 1))).toBe("2025-12-01");
  });

  it("handles December 31", () => {
    expect(toIso(new Date(2025, 11, 31))).toBe("2025-12-31");
  });

  it("handles January 1", () => {
    expect(toIso(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("handles leap year Feb 29", () => {
    expect(toIso(new Date(2024, 1, 29))).toBe("2024-02-29");
  });
});

// ── addDays ────────────────────────────────────────────────────────────────────

describe("addDays", () => {
  it("adds positive days", () => {
    const base = new Date(2025, 5, 10);
    const result = addDays(base, 3);
    expect(result.getDate()).toBe(13);
    expect(result.getMonth()).toBe(5);
  });

  it("subtracts days with negative value", () => {
    const base = new Date(2025, 5, 10);
    const result = addDays(base, -5);
    expect(result.getDate()).toBe(5);
    expect(result.getMonth()).toBe(5);
  });

  it("crosses month boundary forward", () => {
    const base = new Date(2025, 0, 30);
    const result = addDays(base, 5);
    expect(result.getDate()).toBe(4);
    expect(result.getMonth()).toBe(1);
  });

  it("crosses month boundary backward", () => {
    const base = new Date(2025, 1, 3);
    const result = addDays(base, -5);
    expect(result.getDate()).toBe(29);
    expect(result.getMonth()).toBe(0);
  });

  it("returns 0 days = same date", () => {
    const base = new Date(2025, 6, 15);
    const result = addDays(base, 0);
    expect(result.getDate()).toBe(15);
    expect(result.getMonth()).toBe(6);
  });

  it("does not mutate the original date", () => {
    const base = new Date(2025, 0, 10);
    addDays(base, 5);
    expect(base.getDate()).toBe(10);
  });
});

// ── resolveRelativePreset ──────────────────────────────────────────────────────

describe("resolveRelativePreset", () => {
  // Fix "now" to 2025-06-15 for deterministic tests
  const FIXED_NOW = new Date(2025, 5, 15); // June 15, 2025

  afterEach(() => {
    vi.useRealTimers();
  });

  function withFixedDate(fn: () => void) {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    fn();
  }

  it("returns today as from and to", () => {
    withFixedDate(() => {
      const result = resolveRelativePreset("today");
      expect(result).toEqual({ from: "2025-06-15", to: "2025-06-15" });
    });
  });

  it("returns yesterday as from and to", () => {
    withFixedDate(() => {
      const result = resolveRelativePreset("yesterday");
      expect(result).toEqual({ from: "2025-06-14", to: "2025-06-14" });
    });
  });

  it("returns last 7 days", () => {
    withFixedDate(() => {
      const result = resolveRelativePreset("last_7_days");
      expect(result).toEqual({ from: "2025-06-09", to: "2025-06-15" });
    });
  });

  it("returns last 30 days", () => {
    withFixedDate(() => {
      const result = resolveRelativePreset("last_30_days");
      expect(result).toEqual({ from: "2025-05-17", to: "2025-06-15" });
    });
  });

  it("returns this month", () => {
    withFixedDate(() => {
      const result = resolveRelativePreset("this_month");
      expect(result).toEqual({ from: "2025-06-01", to: "2025-06-30" });
    });
  });

  it("returns this year", () => {
    withFixedDate(() => {
      const result = resolveRelativePreset("this_year");
      expect(result).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    });
  });

  it("returns empty strings for empty preset", () => {
    const result = resolveRelativePreset("");
    expect(result).toEqual({ from: "", to: "" });
  });

  it("returns empty strings for unknown preset", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing unknown value
    const result = resolveRelativePreset("unknown" as any);
    expect(result).toEqual({ from: "", to: "" });
  });

  it("this_month handles January correctly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 20));
    const result = resolveRelativePreset("this_month");
    expect(result).toEqual({ from: "2025-01-01", to: "2025-01-31" });
  });

  it("this_month handles February in leap year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 1, 15));
    const result = resolveRelativePreset("this_month");
    expect(result).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });

  it("last_7_days crosses month boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 6, 3)); // July 3
    const result = resolveRelativePreset("last_7_days");
    expect(result).toEqual({ from: "2025-06-27", to: "2025-07-03" });
  });
});
