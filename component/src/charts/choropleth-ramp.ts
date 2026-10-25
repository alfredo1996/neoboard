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
 * The citrine sequential ramp (#2230), one per theme, from the approved chart
 * mock: pale to deep in light mode, deep to bright in dark so the highest value
 * is always the most prominent against the canvas (#1402).
 */
export const CHOROPLETH_SEQ = {
  light: ["#FBEBD0", "#F3C980", "#E0A13A", "#B57A12", "#7A520C"],
  dark: ["#3A2A10", "#6B4A12", "#A06D15", "#D9922A", "#F5C46E"],
} as const;

/**
 * Ends of the default ramp: the light stops of `CHOROPLETH_SEQ`. Exported so
 * the app plugin's schema defaults are sourced from them (they disagreed
 * before #1404). Left at these ends, the chart paints the full themed ramp;
 * a user who picks other ends gets `buildSequentialRamp` between them.
 */
export const CHOROPLETH_DEFAULT_MIN_COLOR = CHOROPLETH_SEQ.light[0];
export const CHOROPLETH_DEFAULT_MAX_COLOR = CHOROPLETH_SEQ.light[4];

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

// Ends that earlier versions saved into widgets as the "default": YlOrBr (the
// editor default before #2230) and ColorBrewer Blues (the demo seeds).
const LEGACY_DEFAULT_ENDS = [
  ["#fff7d6", "#993404"],
  ["#e8f4f8", "#08306b"],
];

const isDefaultEnds = (min: string, max: string) =>
  [
    [CHOROPLETH_DEFAULT_MIN_COLOR, CHOROPLETH_DEFAULT_MAX_COLOR],
    ...LEGACY_DEFAULT_ENDS,
  ].some(
    ([a, b]) =>
      a.toLowerCase() === min.toLowerCase() &&
      b.toLowerCase() === max.toLowerCase(),
  );

/**
 * The legend/ramp colours: the themed citrine ramp when the ends are a default
 * (current or legacy, any case), otherwise the user's two ends, lightness
 * inverted in dark mode so the highest value stays the most prominent (#1402).
 */
export function rampFor(
  dark: boolean,
  minColor: string,
  maxColor: string,
): string[] {
  if (isDefaultEnds(minColor, maxColor)) {
    return [...CHOROPLETH_SEQ[dark ? "dark" : "light"]];
  }
  return dark
    ? buildSequentialRamp(
        invertLightness(minColor),
        invertLightness(maxColor),
        5,
      )
    : buildSequentialRamp(minColor, maxColor, 5);
}
