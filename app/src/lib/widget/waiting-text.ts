import { pickPrompt } from "@neoboard/components/humanize-param-name";
import { paramLabel } from "@/lib/parameter/param-label";
import type { ParameterSourceMap } from "@/lib/parameter/collect-parameter-names";

/** The line under a widget that waits on parameters (#2214, #2232). */
export function waitingText(
  missingParams: string[],
  sourceMap?: ParameterSourceMap,
  currentPageId?: string,
): string {
  const labels = missingParams.map((name) => paramLabel(name, sourceMap));
  if (labels.length === 0) return "Waiting for parameters…";
  const sources = sourceMap?.[missingParams[0]] ?? [];
  if (labels.length === 1 && sources.length > 0) {
    // "above" only when a source sits on this page; else name the page.
    const here =
      currentPageId === undefined ||
      sources.some((s) => s.pageId === currentPageId);
    const where = here ? "above" : "on " + sources[0].pageTitle;
    return `${pickPrompt(labels[0])} ${where} to see this.`;
  }
  const last = labels.at(-1);
  return labels.length === 1
    ? `Waiting for ${last}`
    : `Waiting for ${labels.slice(0, -1).join(", ")} and ${last}`;
}
