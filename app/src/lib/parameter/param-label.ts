import { humanizeParamName } from "@neoboard/components/humanize-param-name";
import type { ParameterSourceMap } from "@/lib/parameter/collect-parameter-names";

/**
 * One name for a parameter (#2232): its selector widget's title, else the key
 * as words, never the raw key.
 */
export function paramLabel(
  name: string,
  sourceMap?: ParameterSourceMap,
): string {
  return (
    sourceMap?.[name]?.find((s) => s.label)?.label ?? humanizeParamName(name)
  );
}
