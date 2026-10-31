import type { DashboardWidget } from "@/lib/db/schema";
import type { ParameterEntry } from "@/stores/parameter-store";
import {
  parseCardBackground,
  type CardBackground,
} from "@neoboard/components/card-background";
import { chartSupportsCardBackground } from "@/lib/plugin/chart-helpers";
import { interpolateTitle } from "./interpolate-title";

const DESCRIPTION_MAX = 200;

/**
 * What a widget's saved card options show (#2394). A chart ignores a stored
 * background (the type may have been changed in the editor), an unknown value
 * reads as Default, and the description's `$param_` tokens are substituted the
 * way the title's are.
 */
export function cardLook(
  widget: DashboardWidget,
  parameters: Record<string, ParameterEntry>,
  labelOf?: (name: string) => string,
): { background: CardBackground; description: string } {
  const s = widget.settings;
  const raw = typeof s?.description === "string" ? s.description : "";
  return {
    background: chartSupportsCardBackground(widget.chartType)
      ? parseCardBackground(s?.cardBackground)
      : "default",
    // The editor stops at 200 characters; a saved or imported card, or a
    // long parameter value, does not (#2394).
    description: interpolateTitle(raw, parameters, labelOf)
      .trim()
      .slice(0, DESCRIPTION_MAX),
  };
}
