import type { ParameterEntry } from "@/stores/parameter-store";
import { formatParameterValue } from "./format-parameter-value";

const PARAM_REGEX = /\$param_(\w+)/g;

/**
 * Replaces `$param_xxx` tokens in a widget title with the current parameter values.
 * When a parameter is not set (missing, null, or undefined), the raw token is preserved.
 * Uses `formatParameterValue` for consistent formatting (handles arrays, date ranges, etc.).
 */
export function interpolateTitle(
  title: string,
  parameters: Record<string, ParameterEntry>,
): string {
  if (!title) return title;
  return title.replace(PARAM_REGEX, (match, name: string) => {
    const entry = parameters[name];
    if (!entry || entry.value === null || entry.value === undefined) return match;
    return formatParameterValue(entry.value);
  });
}
