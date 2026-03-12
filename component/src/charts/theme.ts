/**
 * NeoBoard ECharts themes — "Deep Ocean" palette.
 *
 * 10-color colorblind-safe palette designed for perceptual distinctness
 * across protanopia, deuteranopia, and tritanopia. Colors vary in both
 * hue and luminance so they remain distinguishable even when hue
 * perception is impaired.
 */

export const THEME_LIGHT = "neoboard-light";
export const THEME_DARK = "neoboard-dark";

/**
 * 10-color colorblind-safe "Deep Ocean" palette — light mode.
 *
 * Ordering maximises sequential contrast: the first 5 colours span
 * Blue → Amber → Rose → Teal → Purple — the widest hue + luminance
 * spread — so typical 2–5-series charts are always distinguishable.
 * Similar hues (e.g. Orange/Amber, Green/Teal) are placed far apart.
 */
export const DEEP_OCEAN_LIGHT = [
  "hsl(217, 91%, 60%)",  // 1  Blue
  "hsl(38, 92%, 50%)",   // 2  Amber
  "hsl(347, 77%, 50%)",  // 3  Rose
  "hsl(160, 84%, 39%)",  // 4  Teal
  "hsl(271, 81%, 56%)",  // 5  Purple
  "hsl(24, 90%, 48%)",   // 6  Orange
  "hsl(142, 71%, 45%)",  // 7  Green
  "hsl(199, 89%, 48%)",  // 8  Sky
  "hsl(326, 78%, 42%)",  // 9  Wine
  "hsl(55, 70%, 45%)",   // 10 Olive
];

/** 10-color colorblind-safe "Deep Ocean" palette — dark mode. */
export const DEEP_OCEAN_DARK = [
  "hsl(217, 91%, 65%)",  // 1  Blue
  "hsl(38, 92%, 56%)",   // 2  Amber
  "hsl(347, 77%, 55%)",  // 3  Rose
  "hsl(160, 70%, 50%)",  // 4  Teal
  "hsl(271, 81%, 65%)",  // 5  Purple
  "hsl(24, 90%, 55%)",   // 6  Orange
  "hsl(142, 71%, 50%)",  // 7  Green
  "hsl(199, 89%, 55%)",  // 8  Sky
  "hsl(326, 78%, 50%)",  // 9  Wine
  "hsl(55, 70%, 52%)",   // 10 Olive
];

/**
 * Register NeoBoard light and dark ECharts themes.
 *
 * @param registerTheme  The `echarts.registerTheme` function — passed in
 *   to avoid importing echarts/core in this module (keeps it testable
 *   without full echarts mocking).
 */
export function registerNeoboardThemes(
  registerTheme: (name: string, theme: Record<string, unknown>) => void,
) {
  registerTheme(THEME_LIGHT, {
    color: DEEP_OCEAN_LIGHT,
    backgroundColor: "transparent",
    textStyle: { color: "#1a1a1a" },
    title: { textStyle: { color: "#1a1a1a" } },
    categoryAxis: {
      axisLine: { lineStyle: { color: "#e5e5e5" } },
      axisLabel: { color: "#737373" },
      splitLine: { lineStyle: { color: "#f5f5f5" } },
    },
    valueAxis: {
      axisLine: { lineStyle: { color: "#e5e5e5" } },
      axisLabel: { color: "#737373" },
      splitLine: { lineStyle: { color: "#f5f5f5" } },
    },
    legend: { textStyle: { color: "#737373" } },
  });

  registerTheme(THEME_DARK, {
    color: DEEP_OCEAN_DARK,
    backgroundColor: "transparent",
    textStyle: { color: "#fafafa" },
    title: { textStyle: { color: "#fafafa" } },
    categoryAxis: {
      axisLine: { lineStyle: { color: "#404040" } },
      axisLabel: { color: "#a3a3a3" },
      splitLine: { lineStyle: { color: "#262626" } },
    },
    valueAxis: {
      axisLine: { lineStyle: { color: "#404040" } },
      axisLabel: { color: "#a3a3a3" },
      splitLine: { lineStyle: { color: "#262626" } },
    },
    legend: { textStyle: { color: "#a3a3a3" } },
  });
}
