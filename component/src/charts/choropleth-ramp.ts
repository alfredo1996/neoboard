import { interpolateColor, parseHex, toHex } from "./styling-rule";
import { MUTED_FILL } from "./theme";

/**
 * Choropleth colour-ramp construction, kept in its own module rather than in
 * `choropleth-chart.tsx`.
 *
 * The chart component pulls in React and echarts, and the `charts` barrel
 * reaches NVL, which touches `document` at module scope — so neither can be
 * imported from a node-environment test or from the app's plugin settings
 * schema. The rule here: no React, no echarts, nothing that touches `document`
 * at module scope.
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

type Oklch = [l: number, c: number, h: number];

// OKLab / OKLCH after Bjorn Ottosson; sRGB-linear <-> OKLab matrices.
function hexToOklch(hex: string): Oklch {
  const [r, g, b] = parseHex(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    Math.hypot(a, bb),
    (Math.atan2(bb, a) * 180) / Math.PI,
  ];
}

function oklchToLinear([lightness, chroma, hue]: Oklch): number[] {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) =>
  rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/** Gamut-maps by lowering chroma at fixed lightness and hue. */
function oklchToHex([l, c, h]: Oklch): string {
  let rgb = oklchToLinear([l, c, h]);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear([l, mid, h]))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinear([l, lo, h]);
  }
  const [r, g, b] = rgb.map((v) => toByte(Math.min(1, Math.max(0, v))));
  return toHex(r, g, b);
}

const luminanceOf = (hex: string) => {
  const [r, g, b] = parseHex(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastOf = (a: string, b: string) => {
  const [hi, lo] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Owner decision (#2315): colourless below this OKLCH chroma; the carried hue
// gets min(0.045, half the other end's chroma); the floor is 1.5 : 1.
const COLOURLESS = 0.03;
const CARRIED_CHROMA = 0.045;
const FLOOR_CONTRAST = 1.5;
// The floor stops this far short of the other end's lightness, so a pair too
// close to separate keeps its order instead of crossing.
const FLOOR_GAP = 0.02;
const MAX_L = 0.98;
const STEP = 0.005;

/**
 * The two dark-mode ends of a custom ramp (#2315). On a dark canvas the
 * prominent end is the light one, so each end's OKLCH lightness is flipped
 * (L -> 1 - L) with chroma and hue kept (#1402). OKLCH rather than CIE L*
 * scaling in RGB, which drove both ends to neutral and the lowest to black.
 *
 * 1. A colourless end takes the other end's hue, so the ramp stays one hue.
 * 2. Both ends are lifted together, keeping their gap, until the lowest value's
 *    end is lighter than the no-data fill by `FLOOR_CONTRAST`, so "lowest"
 *    never reads as "missing". The high end stops at `MAX_L`, after which only
 *    the low end rises, to `FLOOR_GAP` below it (level with it for identical
 *    ends, which paint one colour). A reversed pair is left alone.
 */
function darkEnds(minColor: string, maxColor: string): [string, string] {
  const [l1, c1, h1] = hexToOklch(minColor);
  const [l2, c2, h2] = hexToOklch(maxColor);
  const lo: Oklch = [1 - l1, c1, h1];
  const hi: Oklch = [1 - l2, c2, h2];
  if (c1 < COLOURLESS && c2 >= COLOURLESS) {
    lo[1] = Math.max(c1, Math.min(CARRIED_CHROMA, c2 / 2));
    lo[2] = h2;
  } else if (c2 < COLOURLESS && c1 >= COLOURLESS) {
    hi[1] = Math.max(c2, Math.min(CARRIED_CHROMA, c1 / 2));
    hi[2] = h1;
  }
  let lowHex = oklchToHex(lo);
  const clears = (hex: string) =>
    luminanceOf(hex) > luminanceOf(MUTED_FILL.dark) &&
    contrastOf(hex, MUTED_FILL.dark) >= FLOOR_CONTRAST;
  // A reversed pair (lo above hi) is left alone. Otherwise raise the low end
  // alone, up to FLOOR_GAP below the high end. If it still cannot clear the
  // floor (a light-on-light pair), start again from the flipped ends and lift
  // both by the same step, keeping their gap; the high end stops at MAX_L, and
  // the low end then keeps rising, to FLOOR_GAP below it (level with it for
  // identical ends, which paint one colour).
  const [lo0, hi0] = [lo[0], hi[0]];
  const room = Math.min(hi0 - lo0, FLOOR_GAP);
  const lift = (shift: number, both: boolean) => {
    if (both) hi[0] = Math.max(hi0, Math.min(MAX_L, hi0 + shift));
    lo[0] = Math.min(lo0 + shift, hi[0] - room);
    lowHex = oklchToHex(lo);
  };
  if (hi0 >= lo0) {
    for (let s = 0; !clears(lowHex) && lo[0] < hi0 - room; s += STEP)
      lift(s + STEP, false);
    for (let s = 0; !clears(lowHex) && lo[0] < MAX_L - room; s += STEP)
      lift(s + STEP, true);
  }
  return [lowHex, oklchToHex(hi)];
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
 * flipped in dark mode so the highest value stays the most prominent (#1402,
 * #2315).
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
    ? buildSequentialRamp(...darkEnds(minColor, maxColor), 5)
    : buildSequentialRamp(minColor, maxColor, 5);
}
