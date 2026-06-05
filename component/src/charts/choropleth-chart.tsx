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
import { BaseChart } from "./base-chart";
import type { BaseChartProps } from "./types";
import { buildEmptyDataOption } from "./chart-utils";

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
  value: number;
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

/** Normalize common country name variants to match the world GeoJSON. */
const NAME_ALIASES: Record<string, string> = {
  "South Korea": "Korea",
  "North Korea": "Dem. Rep. Korea",
  USA: "United States",
  "United States of America": "United States",
  UK: "United Kingdom",
  "Bosnia and Herzegovina": "Bosnia and Herz.",
  "Antigua and Barbuda": "Antigua and Barb.",
  "Czech Republic": "Czechia",
};

function normalizeData(data: ChoroplethDataItem[]): ChoroplethDataItem[] {
  return data.map((d) => ({
    ...d,
    name: NAME_ALIASES[d.name] ?? d.name,
  }));
}

function ChoroplethChart({
  data,
  roam = true,
  showVisualMap = true,
  minColor = "#e8f4f8",
  maxColor = "#08306b",
  showLabels = false,
  ...rest
}: ChoroplethChartProps) {
  const [mapRegistered, setMapRegistered] = useState(false);
  const registering = useRef(false);

  const normalizedData = useMemo(() => normalizeData(data), [data]);

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
        setMapRegistered(true);
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
    if (!normalizedData.length) return buildEmptyDataOption();

    const values = normalizedData.map((d) => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

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
            Number(val).toLocaleString()
          );
        },
      },
      visualMap: showVisualMap
        ? {
            type: "piecewise" as const,
            right: 16,
            top: 16,
            orient: "vertical",
            splitNumber: 5,
            min: minVal,
            max: maxVal,
            inRange: {
              color: [minColor, "#a6cee3", "#4292c6", "#2171b5", maxColor],
            },
            textStyle: { fontSize: 10 },
            itemWidth: 12,
            itemHeight: 12,
            itemGap: 4,
            formatter: ((a: number, b: number) =>
              Math.round(a).toLocaleString() +
              " \u2013 " +
              Math.round(b).toLocaleString()) as never,
          }
        : undefined,
      series: [
        {
          type: "map",
          map: "world",
          roam,
          scaleLimit: { min: 1, max: 20 },
          center: [0, 20],
          zoom: 1.1,
          label: {
            show: showLabels,
            fontSize: 9,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 13,
              fontWeight: "bold",
              color: "#333",
            },
            itemStyle: {
              areaColor: "#ffd700",
              shadowBlur: 12,
              shadowOffsetX: 2,
              shadowOffsetY: 2,
              shadowColor: "rgba(0, 0, 0, 0.3)",
              borderColor: "#fff",
              borderWidth: 1.5,
            },
          },
          itemStyle: {
            borderColor: "rgba(200, 200, 200, 0.6)",
            borderWidth: 0.5,
            areaColor: "#eee",
          },
          data: normalizedData,
        },
      ],
      animationDuration: 600,
    };
  }, [
    normalizedData,
    mapRegistered,
    roam,
    showVisualMap,
    minColor,
    maxColor,
    showLabels,
  ]);

  return <BaseChart options={options} {...rest} />;
}

export { ChoroplethChart };
