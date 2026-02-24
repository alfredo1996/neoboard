/**
 * Date utility functions for parameter resolution.
 * Extracted to enable pure-function unit testing.
 */

import type { RelativeDatePreset } from "@neoboard/components";

/** Format a Date to ISO YYYY-MM-DD string. */
export function toIso(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Returns a new Date offset by `days` from `base`. */
export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Resolves a relative-date preset key to an ISO date string range [from, to].
 * Uses plain Date arithmetic — no date-fns dependency needed.
 */
export function resolveRelativePreset(preset: RelativeDatePreset | ""): { from: string; to: string } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: toIso(now), to: toIso(now) };
    case "yesterday": {
      const y = addDays(now, -1);
      return { from: toIso(y), to: toIso(y) };
    }
    case "last_7_days":
      return { from: toIso(addDays(now, -6)), to: toIso(now) };
    case "last_30_days":
      return { from: toIso(addDays(now, -29)), to: toIso(now) };
    case "this_month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: toIso(from), to: toIso(to) };
    }
    case "this_year": {
      const from = new Date(now.getFullYear(), 0, 1);
      const to = new Date(now.getFullYear(), 11, 31);
      return { from: toIso(from), to: toIso(to) };
    }
    default:
      return { from: "", to: "" };
  }
}
