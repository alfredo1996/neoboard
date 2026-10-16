import { humanizeParamName } from "@neoboard/components/humanize-param-name";
import type { ParameterSourceMap } from "@/lib/parameter/collect-parameter-names";

/** The line under a widget that waits on parameters (#2214). */
export function waitingText(
  missingParams: string[],
  sourceMap?: ParameterSourceMap,
): string {
  const labels = missingParams.map((name) => humanizeParamName(name));
  if (labels.length === 0) return "Waiting for parameters…";
  if (labels.length === 1 && (sourceMap?.[missingParams[0]]?.length ?? 0) > 0) {
    return `Choose a value for ${labels[0]} to see this.`;
  }
  const last = labels.at(-1);
  return labels.length === 1
    ? `Waiting for ${last}`
    : `Waiting for ${labels.slice(0, -1).join(", ")} and ${last}`;
}
