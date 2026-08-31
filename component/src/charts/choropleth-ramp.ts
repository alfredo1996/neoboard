import { interpolateColor } from "./styling-rule";

/**
 * Choropleth colour-ramp construction, kept in its own module rather than in
 * `choropleth-chart.tsx`.
 *
 * The chart component pulls in React and echarts, and the `charts` barrel
 * reaches NVL, which touches `document` at module scope — so neither can be
 * imported from a node-environment test or from the app's plugin settings
 * schema. This file imports only `styling-rule`, which has no imports at all.
 */

/**
 * Ends of the default sequential ramp — a single warm YlOrBr progression,
 * citrine-adjacent and colourblind-safe.
 *
 * Exported so the app plugin's schema defaults can be sourced from them. The
 * two disagreed before #1404: the component documented this warm ramp while
 * the plugin still supplied ColorBrewer Blues endpoints, and the chart spliced
 * hardcoded warm stops between whichever ends it was given — shipping a legend
 * that ran pale-blue → pale-yellow → orange → dark-orange → navy.
 */
export const CHOROPLETH_DEFAULT_MIN_COLOR = "#fff7d6";
export const CHOROPLETH_DEFAULT_MAX_COLOR = "#993404";

/**
 * Evenly spaced stops from `minColor` to `maxColor` inclusive.
 *
 * `visualMap.inRange.color` used to be the two configurable ends spliced onto
 * three hardcoded warm literals. That made the ramp non-monotonic whenever the
 * ends were not themselves warm, and left `minColor`/`maxColor` 60% dead —
 * whatever the user picked, three of the five stops ignored it (#1404).
 *
 * Interpolating the whole ramp means default and custom take one code path and
 * every band lies between the ends by construction. Reuses the existing
 * `interpolateColor` rather than adding a second colour interpolator.
 */
export function buildSequentialRamp(
  minColor: string,
  maxColor: string,
  stops = 5,
): string[] {
  if (stops < 2) return [minColor];
  return Array.from({ length: stops }, (_, i) =>
    interpolateColor(i, 0, stops - 1, minColor, maxColor),
  );
}
