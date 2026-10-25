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
 * The Hastings categorical palette (#2226): eight muted hues, citrine first,
 * neighbours differing in lightness as well as hue. The default for every
 * chart that has not chosen a palette. Hexes from the "Chart theme" board.
 */
export const HASTINGS_LIGHT = [
  "#C47C08", // Citrine
  "#5B7290", // Slate
  "#5E8C6A", // Sage
  "#B4674A", // Clay
  "#8A6A8F", // Plum
  "#4E8A8C", // Teal
  "#A89060", // Sand
  "#8A93A3", // Steel
];

export const HASTINGS_DARK = [
  "#F2A93B",
  "#8AA3C2",
  "#8DBB98",
  "#D99277",
  "#B497B9",
  "#7FB8BA",
  "#CDB487",
  "#A7AFBD",
];

/** Secondary chart text (ink 3): axis labels, legend, a donut's unit line. */
export const LABEL_MUTED = { light: "#686E7A", dark: "#959BA6" } as const;

/** Chart text. Canvas cannot read a CSS variable, so the face is named. */
export const CHART_FONT_FAMILY =
  '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif';

/** Soft grey a value drops to when another one is highlighted. */
export const HIGHLIGHT_SOFT = {
  light: "#C3C9D2",
  dark: "#4A515C",
} as const;

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

/**
 * One gridline colour per theme, for every cartesian chart (#1247).
 *
 * Charts must not set `splitLine.lineStyle` themselves — differing grid
 * weight makes two widgets on one dashboard look like they came from
 * different tools. Enforced by cartesian-axis-defaults.test.tsx.
 */
export const GRID_LINE_COLOR = {
  light: "#E4E6EA",
  dark: "#262A31",
} as const;

/**
 * The card surface a chart sits on. Treemap tiles are separated by a gap in
 * this colour rather than a border, so the gaps read as the card showing
 * through instead of as grey rules drawn on top of the data (#1405).
 */
export const SURFACE_COLOR = {
  light: "#ffffff",
  dark: "#181b20",
} as const;

/**
 * Fill for treemap groups past the third. A palette hue per group stops
 * meaning anything once there are more groups than distinguishable hues, so
 * the rest share one quiet fill and the group label does the identifying.
 */
export const MUTED_FILL = {
  light: "#eeeff2",
  dark: "#21252b",
} as const;

/**
 * The gantt's "today" marker. A reference line, not a status — it was drawing
 * in the destructive red, which reads as "something is wrong today" (#1273).
 * Muted-foreground mirrors: present without competing with the bars.
 */
export const TODAY_LINE_COLOR = {
  light: "#686E7A",
  dark: "#959BA6",
} as const;

/** The gauge's empty arc (#2228). */
export const TRACK_COLOR = {
  light: "#EEF0F3",
  dark: "#23272E",
} as const;

/**
 * Ink steps for chart marks and labels that sit on the card (#2231): ink 2
 * for nodes, ink 3 for the quiet half of a label. Hex, because canvas cannot
 * read a CSS variable.
 */
export const INK = {
  light: { ink: "#16181D", ink2: "#525A66", ink3: "#686E7A" },
  dark: { ink: "#EDEFF2", ink2: "#AEB4BE", ink3: "#959BA6" },
} as const;

/**
 * Sankey flows at rest. Drawn at 50% opacity: the board's 18% grey measured
 * about 1.1:1 against the page, so a static picture or a PNG export lost them.
 */
export const FLOW_COLOR = {
  light: "#9AA3B0",
  dark: "#6B7480",
} as const;

/** "Rule 2": the stronger hairline, used for a hairline zoom track's window. */
export const RULE_2 = {
  light: "#CDD1D7",
  dark: "#383D46",
} as const;

/**
 * The dataZoom slider, themed once here rather than per chart (#1273).
 *
 * Left to ECharts it renders in a stock lavender-blue that appears nowhere in
 * the palette, directly under a citrine chart. Since #2231 it is a hairline:
 * a quiet track, a grey window on it, and handles that are small card-coloured
 * discs with an ink-3 rim. No data silhouette, no readout.
 */
function dataZoomStyle(
  track: string,
  window: string,
  card: string,
  rim: string,
  label: string,
) {
  return {
    backgroundColor: track,
    borderColor: "transparent",
    fillerColor: window,
    showDetail: false,
    brushSelect: false,
    moveHandleSize: 0,
    handleStyle: { color: card, borderColor: rim },
    moveHandleStyle: { color: window },
    dataBackground: {
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0 },
    },
    selectedDataBackground: {
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0 },
    },
    textStyle: { color: label },
  };
}

interface AxisInk {
  /** Baseline under the categories ("rule 2"). */
  baseline: string;
  /** Labels (ink 3). */
  label: string;
  /** Gridlines (rule). */
  grid: string;
}

/**
 * Axes for every cartesian chart (#2226): the value axis has no line and no
 * ticks, the grid is a 1px hairline, and the category axis draws the one
 * baseline. Labels are 11px ink 3 in the chart face.
 */
function axisStyles({ baseline, label, grid }: AxisInk) {
  const axisLabel = {
    color: label,
    fontSize: 11,
    fontFamily: CHART_FONT_FAMILY,
  };
  const splitLine = { lineStyle: { color: grid, width: 1 } };
  const categoryAxis = {
    axisLine: { show: true, lineStyle: { color: baseline } },
    axisTick: { show: false },
    axisLabel,
    splitLine,
  };
  return {
    categoryAxis,
    // A time axis is a cartesian axis too — without this entry the gantt and
    // any date-based line chart draw ECharts' un-themed grid (#1247).
    timeAxis: categoryAxis,
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabel, formatter: formatAxisCompact },
      splitLine,
    },
  };
}

/** Legend (#2226): 8px squares, left-aligned under the chart. */
function legendStyle(label: string) {
  return {
    icon: "rect",
    itemWidth: 8,
    itemHeight: 8,
    left: 0,
    textStyle: { color: label, fontSize: 11, fontFamily: CHART_FONT_FAMILY },
    // The scroll legend's paging arrows default to a stock blue.
    pageIconColor: label,
    pageIconInactiveColor: label,
    pageTextStyle: { color: label, fontSize: 11 },
  };
}

/**
 * Shared opinionated series/tooltip defaults (#822) — charts should look
 * deliberately styled out of the box:
 * - bars: no floating value labels, subtle top radius
 * - lines: 2px stroke, round caps, unsmoothed, points on hover
 * - pies: 2px gap between slices, in the card colour
 * - tooltips: popover-token styling instead of the ECharts white box
 */
function seriesDefaults(
  popoverBg: string,
  border: string,
  fg: string,
  muted: string,
  surface: string,
) {
  return {
    bar: {
      // Hidden by default; when a widget enables value labels they must read
      // against the canvas in both themes. ECharts' default label is a dark
      // fill with a light stroke halo — invisible in dark mode (#1154). Force
      // the theme foreground and drop the halo.
      label: { show: false, color: fg, textBorderWidth: 0 },
      itemStyle: { borderRadius: [2, 2, 0, 0] },
    },
    line: {
      // "End label" sits on the canvas: same default-halo problem (#2212).
      endLabel: { color: fg, textBorderWidth: 0 },
      smooth: false,
      symbolSize: 4,
      // Points only on hover (#2226); a chart that asks for them overrides.
      showSymbol: false,
      lineStyle: { width: 2, cap: "round" },
      // Flat area fill at 10%, no gradient.
      areaStyle: { opacity: 0.1 },
    },
    pie: {
      itemStyle: { borderWidth: 2, borderColor: surface },
      // Slice labels: same dark-fill + light-halo ECharts default as bar —
      // unreadable on the dark canvas (#1154). Theme foreground, no halo.
      label: { color: fg, textBorderWidth: 0 },
    },
    radar: {
      // Radar axisName and value labels don't inherit the global textStyle —
      // the dim axisName default and the dark-fill + halo value label are
      // both hard to read on the dark canvas (#1154, #2212).
      axisName: { color: muted },
      label: { color: fg, textBorderWidth: 0 },
    },
    // Reference lines (bar and line) draw their label with the same halo
    // default; ECharts merges a component's theme by its main type (#2212).
    markLine: { label: { color: fg, textBorderWidth: 0 } },
    sankey: {
      // Node labels sit beside the nodes, on the canvas: same unreadable
      // dark-fill + light-halo default as bar/pie in dark mode (#2212).
      // Not applied to treemap/sunburst/circle packing (labels sit on their
      // fills, #1095), choropleth, gauge (own colours), the gantt "Today"
      // label, or graph (NVL canvas, not ECharts).
      label: { color: fg, textBorderWidth: 0 },
    },
    treemap: {
      // ECharts ships the breadcrumb in its own light greys (#e8ebf0 chip,
      // #54555a text), which reads as a stray pale box on the dark canvas
      // (#1405). Mirror the card surface and foreground instead.
      breadcrumb: {
        itemStyle: {
          color: popoverBg,
          borderColor: border,
          borderWidth: 1,
          textStyle: { color: fg },
        },
        emphasis: { itemStyle: { color: border } },
      },
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
  // Light: ink 3 #686E7A, rule #E4E6EA, rule 2 #CDD1D7, field #FFFFFF.
  const lightAxes = axisStyles({
    baseline: "#CDD1D7",
    label: "#686E7A",
    grid: GRID_LINE_COLOR.light,
  });
  registerTheme(THEME_LIGHT, {
    color: HASTINGS_LIGHT,
    backgroundColor: "transparent",
    // foreground hsl(220 13% 9%)
    textStyle: { color: "#14161a", fontFamily: CHART_FONT_FAMILY },
    title: { textStyle: { color: "#14161a" } },
    ...lightAxes,
    legend: legendStyle("#686E7A"),
    // Gauge series ignores textStyle for `detail` (the big center number)
    // — it defaults to `'auto'` which picks up axis colors. Force foreground.
    gauge: {
      detail: { color: "#14161a" },
      title: { color: "#686E7A" },
    },
    // visualMap text doesn't inherit the global textStyle — its dim ECharts
    // default is hard to read on the dark canvas (#1154).
    visualMap: { textStyle: { color: "#686E7A" } },
    dataZoom: dataZoomStyle(
      MUTED_FILL.light,
      RULE_2.light,
      SURFACE_COLOR.light,
      INK.light.ink3,
      INK.light.ink3,
    ),
    ...seriesDefaults(
      "#FFFFFF",
      "#E4E6EA",
      "#14161a",
      "#686E7A",
      SURFACE_COLOR.light,
    ),
  });

  // Dark: ink 3 #959BA6, rule #262A31, rule 2 #383D46, field #1B1E23.
  const darkAxes = axisStyles({
    baseline: "#383D46",
    label: "#959BA6",
    grid: GRID_LINE_COLOR.dark,
  });
  registerTheme(THEME_DARK, {
    color: HASTINGS_DARK,
    backgroundColor: "transparent",
    // foreground hsl(220 14% 96%)
    textStyle: { color: "#f3f4f6", fontFamily: CHART_FONT_FAMILY },
    title: { textStyle: { color: "#f3f4f6" } },
    ...darkAxes,
    legend: legendStyle("#959BA6"),
    gauge: {
      detail: { color: "#f3f4f6" },
      title: { color: "#959BA6" },
    },
    // See the light theme note — visualMap text needs explicit color.
    visualMap: { textStyle: { color: "#959BA6" } },
    dataZoom: dataZoomStyle(
      MUTED_FILL.dark,
      RULE_2.dark,
      SURFACE_COLOR.dark,
      INK.dark.ink3,
      INK.dark.ink3,
    ),
    ...seriesDefaults(
      "#1B1E23",
      "#262A31",
      "#f3f4f6",
      "#959BA6",
      SURFACE_COLOR.dark,
    ),
  });
}

/**
 * Map clusters and single markers (#2230): citrine fill, ink on it for the
 * count (>= 4.5:1 both themes, pinned by map-chart.test.tsx), and a ring in the
 * card colour that separates a cluster from the tiles beneath it.
 */
export const MAP_CLUSTER = {
  light: { fill: "#C47C08", ink: "#16181D", ring: "#FFFFFF" },
  dark: { fill: "#F2A93B", ink: "#14161A", ring: "#181B20" },
} as const;
