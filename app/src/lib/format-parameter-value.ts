/**
 * Formatting utilities for parameter display in the dashboard parameter bar.
 * Pure functions — no React, no store imports.
 */

import type { ParameterEntry } from "@/stores/parameter-store";

/** Human-readable labels for relative date presets. */
const relativePresetLabels: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  this_year: "This year",
  last_year: "Last year",
};

/** Format a parameter value for human-readable display in the parameter bar. */
export function formatParameterValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    return relativePresetLabels[value] ?? value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      return `${value[0]} – ${value[1]}`;
    }
    return value.map(String).join(", ");
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if ("from" in obj && "to" in obj) return `${obj.from} → ${obj.to}`;
  }
  return String(value);
}

/** Sub-parameter suffixes that should hide their parent. */
const SUB_PARAM_SUFFIXES = ["_from", "_to", "_min", "_max"];

/**
 * Filter out parent parameters when derived sub-parameters exist.
 * E.g., if `dates_from` and `dates_to` both exist, hide `dates`.
 */
export function filterParentParams(
  entries: [string, ParameterEntry][]
): [string, ParameterEntry][] {
  const names = new Set(entries.map(([n]) => n));
  return entries.filter(([name]) => {
    // If any sub-param for this name exists, hide the parent
    const hasSubParam = SUB_PARAM_SUFFIXES.some((suffix) =>
      names.has(name + suffix)
    );
    return !hasSubParam;
  });
}
