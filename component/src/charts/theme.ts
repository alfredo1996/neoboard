/**
 * NeoBoard ECharts themes — "Citrine" palette (#821, #822).
 *
 * 10-color categorical palette anchored on the Graphite & Citrine amber
 * accent. Optimized programmatically for colorblind safety: minimum
 * pairwise deltaE under protanopia/deuteranopia/tritanopia simulation
 * dominates the old Deep Ocean palette on every axis (enforced by
 * citrine-cvd-safety.test.ts).
 */

export const THEME_LIGHT = "neoboard-light";
export const THEME_DARK = "neoboard-dark";

/**
 * 10-color colorblind-safe "Citrine" palette — light mode.
 *
 * Color 1 is the brand citrine amber. The first 5 alternate hue families
 * AND luminance (amber/teal/violet/rose/moss) so typical 2–5-series
 * charts stay distinguishable under every common color-vision deficiency.
 */
export const CITRINE_LIGHT = [
  "hsl(38, 95%, 55%)", //  1 Citrine amber (brand accent)
  "hsl(185, 70%, 48%)", //  2 Teal-cyan
  "hsl(265, 55%, 48%)", //  3 Violet
  "hsl(350, 70%, 48%)", //  4 Rose
  "hsl(95, 45%, 66%)", //  5 Moss
  "hsl(330, 65%, 38%)", //  6 Wine
  "hsl(240, 55%, 66%)", //  7 Periwinkle
  "hsl(15, 75%, 58%)", //  8 Coral
  "hsl(172, 65%, 38%)", //  9 Deep teal
  "hsl(150, 55%, 66%)", // 10 Mint
];

/** 10-color colorblind-safe "Citrine" palette — dark mode (lifted luminance). */
export const CITRINE_DARK = [
  "hsl(38, 95%, 58%)", //  1 Citrine amber
  "hsl(185, 65%, 52%)", //  2 Teal-cyan
  "hsl(265, 55%, 56%)", //  3 Violet
  "hsl(350, 70%, 55%)", //  4 Rose
  "hsl(95, 45%, 68%)", //  5 Moss
  "hsl(330, 60%, 46%)", //  6 Wine
  "hsl(240, 55%, 70%)", //  7 Periwinkle
  "hsl(15, 75%, 62%)", //  8 Coral
  "hsl(172, 60%, 44%)", //  9 Deep teal
  "hsl(150, 50%, 68%)", // 10 Mint
];

/**
 * @deprecated Renamed in the v1.1 redesign (#821) — use CITRINE_LIGHT /
 * CITRINE_DARK. Kept so external chart plugins compiled against the old
 * names keep working; the palette id "deep-ocean" aliases too.
 */
export const DEEP_OCEAN_LIGHT = CITRINE_LIGHT;
/** @deprecated See DEEP_OCEAN_LIGHT. */
export const DEEP_OCEAN_DARK = CITRINE_DARK;

/**
 * Compact axis number formatting (#822): 8000 → "8K", 45200 → "45.2K",
 * 1200000 → "1.2M". Non-numeric category labels pass through untouched.
 */
export function formatAxisCompact(value: number | string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return String(value);
  }
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const compact = (divisor: number, suffix: string) => {
    const n = abs / divisor;
    const rendered = n >= 100 ? Math.round(n).toString() : n.toFixed(1);
    return `${sign}${rendered.replace(/\.0$/, "")}${suffix}`;
  };
  if (abs >= 1e9) return compact(1e9, "B");
  if (abs >= 1e6) return compact(1e6, "M");
  if (abs >= 1e3) return compact(1e3, "K");
  return String(value);
}

function axisStyle(line: string, label: string, split: string) {
  return {
    axisLine: { lineStyle: { color: line } },
    axisLabel: { color: label },
    splitLine: { lineStyle: { color: split } },
  };
}

/**
 * Shared opinionated series/tooltip defaults (#822) — charts should look
 * deliberately styled out of the box:
 * - bars: no floating value labels, subtle top radius
 * - lines: fine 1.5px stroke, round caps, smooth curves
 * - pies: hairline gap between slices
 * - tooltips: popover-token styling instead of the ECharts white box
 */
function seriesDefaults(popoverBg: string, border: string, fg: string) {
  return {
    bar: {
      label: { show: false },
      itemStyle: { borderRadius: [3, 3, 0, 0] },
    },
    line: {
      smooth: true,
      symbolSize: 4,
      lineStyle: { width: 1.5, cap: "round" },
    },
    pie: {
      itemStyle: { borderWidth: 2, borderColor: "transparent" },
    },
    tooltip: {
      backgroundColor: popoverBg,
      borderColor: border,
      borderRadius: 8, // matches --radius (0.5rem)
      textStyle: { color: fg, fontSize: 12 },
      extraCssText: "box-shadow: var(--shadow-lg); padding: 8px 12px;",
    },
  };
}

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
  // Light: border hsl(220 13% 91%) ≈ #e5e7eb, muted-fg hsl(220 9% 44%) ≈ #666d7a
  const lightAxis = {
    ...axisStyle("#e5e7eb", "#666d7a", "#f0f2f4"),
  };
  registerTheme(THEME_LIGHT, {
    color: CITRINE_LIGHT,
    backgroundColor: "transparent",
    textStyle: { color: "#14161a" }, // foreground hsl(220 13% 9%)
    title: { textStyle: { color: "#14161a" } },
    categoryAxis: lightAxis,
    valueAxis: {
      ...lightAxis,
      axisLabel: { color: "#666d7a", formatter: formatAxisCompact },
    },
    legend: { textStyle: { color: "#666d7a" } }, // muted-foreground
    ...seriesDefaults("#ffffff", "#e5e7eb", "#14161a"),
  });

  // Dark: border hsl(220 13% 17%) ≈ #262931, muted-fg hsl(220 9% 62%) ≈ #959ba7
  const darkAxis = axisStyle("#262931", "#959ba7", "#1d2025");
  registerTheme(THEME_DARK, {
    color: CITRINE_DARK,
    backgroundColor: "transparent",
    textStyle: { color: "#f3f4f6" }, // foreground hsl(220 14% 96%)
    title: { textStyle: { color: "#f3f4f6" } },
    categoryAxis: darkAxis,
    valueAxis: {
      ...darkAxis,
      axisLabel: { color: "#959ba7", formatter: formatAxisCompact },
    },
    legend: { textStyle: { color: "#959ba7" } }, // muted-foreground
    ...seriesDefaults("#181b20", "#262931", "#f3f4f6"),
  });
}
