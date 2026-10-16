import type { ParameterEntry } from "@/stores/parameter-store";
import { humanizeParamName } from "@neoboard/components/humanize-param-name";
import { formatParameterValue } from "@/lib/parameter/format-parameter-value";

const PARAM_REGEX = /\$param_(\w+)/g;

/**
 * Replaces `$param_xxx` tokens in a widget title with the current parameter values.
 * When a parameter is not set (missing, null, or undefined), the name is shown in words, in brackets (`[Gallery region]`), never the raw token.
 * Uses `formatParameterValue` for consistent formatting (handles arrays, date ranges, etc.).
 */
export function interpolateTitle(
  title: string,
  parameters: Record<string, ParameterEntry>,
): string {
  if (!title) return title;
  return title.replace(PARAM_REGEX, (_match, name: string) => {
    const entry = parameters[name];
    if (!entry || entry.value === null || entry.value === undefined)
      return `[${humanizeParamName(name)}]`;
    return formatParameterValue(entry.value);
  });
}
