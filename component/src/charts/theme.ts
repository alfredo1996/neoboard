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
function axisStyle(line: string, label: string, split: string) {
  return {
    axisLine: { lineStyle: { color: line } },
    axisLabel: { color: label },
    splitLine: { lineStyle: { color: split } },
  };
}

export function registerNeoboardThemes(
  registerTheme: (name: string, theme: Record<string, unknown>) => void,
) {
  // Light axis: border hsl(214,20%,90%) ≈ #dfe4ea, muted-fg hsl(215,16%,47%) ≈ #657084
  const lightAxis = axisStyle("#dfe4ea", "#657084", "#f0f2f5");
  registerTheme(THEME_LIGHT, {
    color: DEEP_OCEAN_LIGHT,
    backgroundColor: "transparent",
    textStyle: { color: "#1e293b" },           // foreground hsl(222,47%,11%) ≈ #1e293b
    title: { textStyle: { color: "#1e293b" } },
    categoryAxis: lightAxis,
    valueAxis: lightAxis,
    legend: { textStyle: { color: "#657084" } }, // muted-foreground
  });

  // Dark axis: border hsl(217,33%,17%) ≈ #1d2a3f, muted-fg hsl(215,20%,65%) ≈ #94a3b8
  const darkAxis = axisStyle("#1d2a3f", "#94a3b8", "#162032");
  registerTheme(THEME_DARK, {
    color: DEEP_OCEAN_DARK,
    backgroundColor: "transparent",
    textStyle: { color: "#f8fafc" },           // foreground hsl(210,40%,98%) ≈ #f8fafc
    title: { textStyle: { color: "#f8fafc" } },
    categoryAxis: darkAxis,
    valueAxis: darkAxis,
    legend: { textStyle: { color: "#94a3b8" } }, // muted-foreground
  });
}
