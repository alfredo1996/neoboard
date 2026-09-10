import { interpolateColor, parseHex, toHex } from "./styling-rule";

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

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const toByte = (c: number) =>
  255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

// CIE L* <-> relative luminance Y (both on the D65 white, Y in [0, 1]).
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;
const lightnessOf = (y: number) =>
  y > EPSILON ? 116 * Math.cbrt(y) - 16 : y * KAPPA;
const luminanceOf = (l: number) =>
  l > KAPPA * EPSILON ? ((l + 16) / 116) ** 3 : l / KAPPA;

/**
 * `hex` with its perceptual lightness flipped (CIE L* -> 100 - L*), hue kept.
 *
 * On a dark canvas the prominent end of a ramp is the light one, so a
 * light-to-dark ramp painted as-is ranks regions backwards (#1402). Inverting
 * each end keeps the hue a user picked for "lowest" on the lowest value while
 * restoring "higher reads as more prominent".
 *
 * The axis has to be perceptual: an HSL flip leaves every pure hue at L = 0.5,
 * so a saved yellow -> red pair stayed brightest-at-lowest in dark mode. The
 * target luminance is reached exactly in linear light — channels scaled toward
 * black to darken, mixed toward white to lighten — so the ends' order always
 * swaps. Lightening a saturated colour this way costs it some saturation.
 */
export function invertLightness(hex: string): string {
  const rgb = parseHex(hex).map(toLinear);
  const y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const target = luminanceOf(100 - lightnessOf(y));
  const out =
    target <= y
      ? // target <= y implies y > 0: black (y = 0) has target 1.
        rgb.map((c) => (c * target) / y)
      : rgb.map((c) => c + ((1 - c) * (target - y)) / (1 - y));
  const [r, g, b] = out.map(toByte);
  return toHex(r, g, b);
}
