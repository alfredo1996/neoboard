import { useMemo, useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { MapChart as EMapChart } from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
  GeoComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { BaseChart, useDarkMode } from "./base-chart";
import type { BaseChartProps } from "./types";
import {
  buildEmptyDataOption,
  fillLabelStyle,
  formatNumber,
} from "./chart-utils";
import { MUTED_FILL, SURFACE_COLOR } from "./theme";
import { equalEarth } from "./equal-earth";
import {
  buildRegionIndex,
  matchRegions,
  type RegionFeature,
  type RegionIndex,
} from "./choropleth-regions";
import {
  rampFor,
  CHOROPLETH_DEFAULT_MIN_COLOR,
  CHOROPLETH_DEFAULT_MAX_COLOR,
} from "./choropleth-ramp";

echarts.use([
  EMapChart,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
  GeoComponent,
  CanvasRenderer,
]);

export interface ChoroplethDataItem {
  name: string;
  /**
   * `null` = the query returned no measurement for this region — not a zero.
   * `normalizeData` below translates it to ECharts' own no-data marker `"-"`,
   * the only missing value inside `MapSeriesOption["data"]`
   * (`OptionDataValueNumeric = number | '-'`; the generic `OptionDataValue`
   * that admits null is NOT the map variant). A `"-"` region keeps
   * `itemStyle.areaColor` and its tooltip value arrives as NaN, so the
   * formatter's existing `isNaN` branch already handles it (#1655).
   */
  value: number | null;
}

export interface ChoroplethChartProps extends Omit<BaseChartProps, "options"> {
  /** Array of { name, value } where name matches GeoJSON feature names. */
  data: ChoroplethDataItem[];
  /** Enable zoom and pan */
  roam?: boolean;
  /** Show the visual map (color legend) */
  showVisualMap?: boolean;
  /** Low-end color for the gradient */
  minColor?: string;
  /** High-end color for the gradient */
  maxColor?: string;
  /** Show region labels */
  showLabels?: boolean;
}

function toSeriesData(rows: ChoroplethDataItem[]) {
  return rows.map((d) => ({
    ...d,
    // ECharts' documented no-data marker, and the only one MapSeriesOption's
    // data union accepts — so this needs no `as` cast. Translating at this
    // boundary keeps the exported prop type a plain domain type (#1655).
    value: d.value ?? ("-" as const),
  }));
}

function ChoroplethChart({
  data,
  roam = true,
  showVisualMap = true,
  minColor = CHOROPLETH_DEFAULT_MIN_COLOR,
  maxColor = CHOROPLETH_DEFAULT_MAX_COLOR,
  showLabels = false,
  ariaDescription,
  ...rest
}: ChoroplethChartProps) {
  const [regionIndex, setRegionIndex] = useState<RegionIndex | null>(null);
  const mapRegistered = regionIndex !== null;
  const registering = useRef(false);
  // Reactive theme so the memo rebuilds on toggle — otherwise the no-data
  // region fill and label styles freeze at their mount-time value. (#chart-review)
  const dark = useDarkMode();

  // Rows are matched to Natural Earth countries by ISO code, then name/alias.
  // A row that matches nothing is surfaced below the chart, not dropped.
  const { matched, unmatched } = useMemo(
    () =>
      regionIndex
        ? matchRegions(data, regionIndex)
        : { matched: [], unmatched: [] },
    [data, regionIndex],
  );
  const normalizedData = useMemo(() => toSeriesData(matched), [matched]);

  useEffect(() => {
    if (mapRegistered || registering.current) return;
    registering.current = true;
    let cancelled = false;

    import("./world.geo.json")
      .then((module) => {
        if (cancelled) return;
        const geoJSON = module.default ?? module;
        if (!echarts.getMap("world")) {
          echarts.registerMap("world", geoJSON as never);
        }
        setRegionIndex(
          buildRegionIndex((geoJSON as { features: RegionFeature[] }).features),
        );
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load world map GeoJSON:", err);
          registering.current = false; // allow retry on re-mount
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mapRegistered]);

  const options = useMemo((): EChartsOption | undefined => {
    if (!mapRegistered) return undefined;
    if (!data.length) return buildEmptyDataOption(dark);

    // Only measured values set the ramp domain. `Math.min(null, …)` is 0, so
    // one unmeasured region would anchor the legend at zero and shift every
    // real country up a band (#1655).
    const values = normalizedData
      .map((d) => d.value)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    // ponytail: an all-null result collapses the domain to 0–0. That is exactly
    // the legend today's all-zeros path already produces, and the map itself
    // renders correctly (every region on areaColor) — suppress the visualMap
    // only if someone reports the degenerate legend.
    const minVal = values.length ? Math.min(...values) : 0;
    const maxVal = values.length ? Math.max(...values) : 0;

    return {
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        borderColor: "transparent",
        textStyle: { color: "#fff", fontSize: 13 },
        formatter: (params: unknown) => {
          const p = params as { name: string; value: unknown };
          const val = p.value;
          if (val == null || (typeof val === "number" && isNaN(val))) {
            return p.name;
          }
          return (
            "<strong>" +
            echarts.format.encodeHTML(p.name) +
            "</strong><br/>" +
            formatNumber(Number(val), { context: "tooltip" })
          );
        },
      },
      // Always emitted: the visualMap is what maps values to colours, so
      // "Show Legend" toggles only its visibility (#1402).
      visualMap: {
        type: "continuous" as const,
        show: showVisualMap,
        left: 8,
        bottom: 4,
        orient: "horizontal",
        min: minVal,
        max: maxVal,
        calculable: false,
        inRange: {
          // Interpolated end-to-end so every band lies on the ramp between
          // the configured colours — see buildSequentialRamp (#1404). Dark
          // mode inverts the ends' lightness so the highest value stays the
          // most prominent against the canvas (#1402).
          color: rampFor(dark, minColor, maxColor),
        },
        // The two end values, high first, as in the approved chart mock.
        text: [
          Math.round(maxVal).toLocaleString(),
          Math.round(minVal).toLocaleString(),
        ],
        textStyle: { fontSize: 11 },
        itemWidth: 8,
        itemHeight: 110,
      },
      series: [
        {
          type: "map",
          map: "world",
          roam,
          scaleLimit: { min: 1, max: 20 },
          projection: equalEarth,
          top: 4,
          // Room for the legend strip under the map (#2230).
          bottom: showVisualMap ? 28 : 4,
          left: 4,
          right: 4,
          // Without this the four insets stretch Equal Earth to the widget's
          // shape (1.64:1 instead of its true 2.05:1).
          preserveAspect: "contain",
          select: { disabled: true },
          label: {
            show: showLabels,
            fontSize: 9,
            // Dark mode: labels sit on near-black no-data regions and dark
            // ramp fills, where ECharts' default dark text vanishes — use
            // white with a dark shadow (treemap pattern, #1154). Light mode
            // keeps the default dark text, which reads on the pale map.
            ...(dark ? fillLabelStyle : {}),
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 13,
              fontWeight: "bold",
              ...(dark ? fillLabelStyle : {}),
            },
            // Keep the region's data color on hover (don't overwrite it with a
            // off-brand gold) — the border + shadow are the hover affordance.
            itemStyle: {
              shadowBlur: 12,
              shadowOffsetX: 2,
              shadowOffsetY: 2,
              shadowColor: "rgba(0, 0, 0, 0.3)",
              borderColor: "#fff",
              borderWidth: 1.5,
            },
          },
          itemStyle: {
            // Borders in the card colour: countries read as shapes on the card.
            borderColor: SURFACE_COLOR[dark ? "dark" : "light"],
            borderWidth: 0.5,
            // No-data fill, the theme's muted surface.
            areaColor: MUTED_FILL[dark ? "dark" : "light"],
          },
          data: normalizedData,
        },
      ],
      animationDuration: 600,
    };
  }, [
    normalizedData,
    data.length,
    mapRegistered,
    roam,
    showVisualMap,
    minColor,
    maxColor,
    showLabels,
    dark,
  ]);

  const names = unmatched.map((r) => r.name).join(", ");
  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <BaseChart
          options={options}
          ariaDescription={
            ariaDescription ?? `Choropleth map with ${data.length} regions`
          }
          {...rest}
        />
      </div>
      {/* Always mounted so assistive tech sees the text change; it sits below
          the map, not over its shapes, and wraps instead of truncating. */}
      <div
        role="status"
        className={
          unmatched.length > 0
            ? "line-clamp-2 shrink-0 px-2 py-1 text-xs text-muted-foreground focus:line-clamp-none focus:max-h-24 focus:overflow-auto"
            : "sr-only"
        }
        title={names}
        // Focusable (keyboard and tap) so the clamped list can be read in full.
        tabIndex={unmatched.length > 0 ? 0 : undefined}
      >
        {unmatched.length > 0 &&
          `${unmatched.length} ${unmatched.length === 1 ? "row" : "rows"} not matched to a country: ${names}`}
      </div>
    </div>
  );
}

export { ChoroplethChart };
