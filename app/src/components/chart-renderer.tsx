"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import { AlertCircle } from "lucide-react";
import { normalizeValue } from "@/lib/normalize-value";
import type { ChartType } from "@/lib/chart-registry";
import {
  Skeleton,
  EmptyState,
  JsonViewer,
  MarkdownWidget,
  IframeWidget,
} from "@neoboard/components";

// Chart components use ECharts (browser APIs) — must be loaded client-side only
const BarChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.BarChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> }
);
const LineChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.LineChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> }
);
const PieChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.PieChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> }
);
const SingleValueChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.SingleValueChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> }
);
import type {
  BarChartDataPoint,
  LineChartDataPoint,
  PieChartDataPoint,
  GraphNode,
  GraphEdge,
  MapMarker,
  EChartsClickEvent,
  StylingRule,
  GaugeDataPoint,
  SankeyChartData,
  SunburstDataItem,
  RadarChartData,
  TreemapDataItem,
} from "@neoboard/components";
import { ParameterWidgetRenderer } from "@/components/parameter-widget-renderer";
import type { ParameterType } from "@/stores/parameter-store";
import { GraphExplorationWrapper } from "./graph-exploration-wrapper";
import { TableRenderer } from "./table-renderer";

// Form widget — direct import (client component, no SSR concern since chart-renderer is "use client")
import { FormWidgetRenderer } from "./form-widget-renderer";

// Lazy-load GraphChart so NVL (WebGL) is only bundled when a graph widget is rendered
const GraphChart = dynamic(
  () => import("@neoboard/components").then((mod) => ({ default: mod.GraphChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> }
);

// Dynamically import MapChart to avoid SSR issues with Leaflet
const MapChart = dynamic(
  () => import("@neoboard/components").then((mod) => ({ default: mod.MapChart })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    ),
  }
);

// New ECharts chart types — loaded client-side only
const GaugeChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.GaugeChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> }
);
const SankeyChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.SankeyChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> }
);
const SunburstChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.SunburstChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> }
);
const RadarChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.RadarChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> }
);
const TreemapChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.TreemapChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> }
);

export interface ChartRendererProps {
  type: ChartType;
  data: unknown;
  settings?: Record<string, unknown>;
  onChartClick?: (point: Record<string, unknown>) => void;
  /** Restrict which table columns are clickable. Only applies to table type. */
  clickableColumns?: string[];
  connectionId?: string;
  widgetId?: string;
  resultId?: string;
  query?: string;
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
  /** When true, graph widgets trigger a fit-to-viewport after mount. */
  autoFit?: boolean;
}

/**
 * Renders the appropriate chart component based on widget type and data.
 * Forwards chart-specific settings as props to the underlying chart component.
 */
export function ChartRenderer({ type, data, settings = {}, onChartClick, clickableColumns, connectionId, widgetId, resultId, query, stylingRules, paramValues, autoFit }: ChartRendererProps) {
  const colorThresholds =
    typeof settings.colorThresholds === "string" ? settings.colorThresholds : undefined;

  const handleEChartsClick = useMemo(() => {
    if (!onChartClick) return undefined;
    return (e: EChartsClickEvent) =>
      onChartClick({ name: e.name, value: e.value, seriesName: e.seriesName, dataIndex: e.dataIndex });
  }, [onChartClick]);

  switch (type) {
    case "bar":
      return (
        <BarChart
          data={(data as BarChartDataPoint[]) ?? []}
          orientation={settings.orientation as "vertical" | "horizontal" | undefined}
          stacked={settings.stacked as boolean | undefined}
          showValues={settings.showValues as boolean | undefined}
          showLegend={settings.showLegend as boolean | undefined}
          barWidth={settings.barWidth as number | undefined}
          barGap={settings.barGap as string | undefined}
          xAxisLabel={settings.xAxisLabel as string | undefined}
          yAxisLabel={settings.yAxisLabel as string | undefined}
          showGridLines={settings.showGridLines as boolean | undefined}
          colorThresholds={colorThresholds}
          stylingRules={stylingRules}
          paramValues={paramValues}
          onClick={handleEChartsClick}
          colorblindMode={settings.colorblindMode as boolean | undefined}
        />
      );

    case "line":
      return (
        <LineChart
          data={(data as LineChartDataPoint[]) ?? []}
          smooth={settings.smooth as boolean | undefined}
          area={settings.area as boolean | undefined}
          xAxisLabel={settings.xAxisLabel as string | undefined}
          yAxisLabel={settings.yAxisLabel as string | undefined}
          showLegend={settings.showLegend as boolean | undefined}
          lineWidth={settings.lineWidth as number | undefined}
          stepped={settings.stepped as boolean | undefined}
          showPoints={settings.showPoints as boolean | undefined}
          showGridLines={settings.showGridLines as boolean | undefined}
          colorThresholds={colorThresholds}
          stylingRules={stylingRules}
          paramValues={paramValues}
          onClick={handleEChartsClick}
          colorblindMode={settings.colorblindMode as boolean | undefined}
        />
      );

    case "pie":
      return (
        <PieChart
          data={(data as PieChartDataPoint[]) ?? []}
          donut={settings.donut as boolean | undefined}
          showLabel={settings.showLabel as boolean | undefined}
          showLegend={settings.showLegend as boolean | undefined}
          roseMode={settings.roseMode as boolean | undefined}
          labelPosition={settings.labelPosition as "outside" | "inside" | "center" | undefined}
          showPercentage={settings.showPercentage as boolean | undefined}
          sortSlices={settings.sortSlices as boolean | undefined}
          colorThresholds={colorThresholds}
          stylingRules={stylingRules}
          paramValues={paramValues}
          onClick={handleEChartsClick}
          colorblindMode={settings.colorblindMode as boolean | undefined}
        />
      );

    case "single-value": {
      const raw = data ?? 0;
      const val = typeof raw === "number" || typeof raw === "string" ? raw : normalizeValue(raw) ?? String(raw);
      return (
        <SingleValueChart
          value={typeof val === "number" || typeof val === "string" ? val : String(val)}
          title={settings.title as string | undefined}
          prefix={settings.prefix as string | undefined}
          suffix={settings.suffix as string | undefined}
          fontSize={settings.fontSize as "sm" | "md" | "lg" | "xl" | undefined}
          numberFormat={settings.numberFormat as "plain" | "comma" | "compact" | "percent" | undefined}
          colorThresholds={colorThresholds}
          stylingRules={stylingRules}
          paramValues={paramValues}
        />
      );
    }

    case "graph": {
      const graphData = (data ?? { nodes: [], edges: [] }) as {
        nodes: GraphNode[];
        edges: GraphEdge[];
      };
      if (connectionId) {
        return (
          <GraphExplorationWrapper
            widgetId={widgetId ?? connectionId}
            nodes={graphData.nodes ?? []}
            edges={graphData.edges ?? []}
            connectionId={connectionId}
            settings={settings}
            onChartClick={onChartClick}
            resultId={resultId}
            autoFit={autoFit}
          />
        );
      }
      return (
        <GraphChart
          nodes={graphData.nodes ?? []}
          edges={graphData.edges ?? []}
          layout={settings.layout as "force" | "circular" | undefined}
          showLabels={settings.showLabels as boolean | undefined}
          onNodeSelect={onChartClick ? (ids) => { if (ids.length) onChartClick({ nodeId: ids[0] }); } : undefined}
          autoFit={autoFit}
        />
      );
    }

    case "map": {
      const markers = (data ?? []) as MapMarker[];
      return (
        <MapChart
          markers={markers}
          tileLayer={settings.tileLayer as string | undefined}
          zoom={settings.zoom as number | undefined}
          minZoom={settings.minZoom as number | undefined}
          maxZoom={settings.maxZoom as number | undefined}
          autoFitBounds={settings.autoFitBounds !== false}
          onMarkerClick={onChartClick ? (m) => onChartClick({ id: m.id, label: m.label, lat: m.lat, lng: m.lng }) : undefined}
        />
      );
    }

    case "table":
      return (
        <TableRenderer
          data={data}
          settings={settings}
          onCellClick={onChartClick ? (info) => onChartClick({ _clickedColumn: info.column, _clickedValue: info.value }) : undefined}
          clickableColumns={clickableColumns}
          stylingRules={stylingRules}
          paramValues={paramValues}
        />
      );

    case "parameter-select": {
      const pName = settings.parameterName as string | undefined;
      if (!pName) {
        return (
          <EmptyState
            title="No parameter name"
            description="Configure a parameter name in the widget settings."
            className="py-6"
          />
        );
      }
      return (
        <div className="p-4">
          <ParameterWidgetRenderer
            parameterName={pName}
            parameterType={(settings.parameterType as ParameterType | undefined) ?? "select"}
            connectionId={connectionId}
            seedQuery={(settings.seedQuery as string | undefined)}
            parentParameterName={settings.parentParameterName as string | undefined}
            rangeMin={(settings.rangeMin as number | undefined) ?? 0}
            rangeMax={(settings.rangeMax as number | undefined) ?? 100}
            rangeStep={(settings.rangeStep as number | undefined) ?? 1}
            placeholder={(settings.placeholder as string | undefined) || undefined}
            searchable={(settings.searchable as boolean | undefined) ?? true}
            widgetId={widgetId}
          />
        </div>
      );
    }

    case "json":
      return (
        <div className="h-full overflow-auto">
          <JsonViewer
            data={data}
            initialExpanded={(settings.initialExpanded as number) ?? 2}
          />
        </div>
      );

    case "form":
      return (
        <FormWidgetRenderer
          connectionId={connectionId ?? ""}
          query={query ?? ""}
          settings={settings}
        />
      );

    case "markdown":
      return (
        <MarkdownWidget
          content={settings.content as string | undefined}
        />
      );

    case "iframe":
      return (
        <IframeWidget
          url={settings.url as string | undefined}
          title={settings.iframeTitle as string | undefined}
          sandbox={settings.sandbox as string | undefined}
        />
      );

    case "gauge":
      return (
        <GaugeChart
          data={(data as GaugeDataPoint[]) ?? []}
          min={settings.min as number | undefined}
          max={settings.max as number | undefined}
          showProgress={settings.showProgress as boolean | undefined}
          showPointer={settings.showPointer as boolean | undefined}
          showDetail={settings.showDetail as boolean | undefined}
          startAngle={settings.startAngle as number | undefined}
          endAngle={settings.endAngle as number | undefined}
        />
      );

    case "sankey": {
      const sankeyData = (data as SankeyChartData) ?? { nodes: [], links: [] };
      return (
        <SankeyChart
          data={sankeyData}
          orient={settings.orient as "horizontal" | "vertical" | undefined}
          showLabels={settings.showLabels as boolean | undefined}
          nodeWidth={settings.nodeWidth as number | undefined}
          nodeGap={settings.nodeGap as number | undefined}
        />
      );
    }

    case "sunburst":
      return (
        <SunburstChart
          data={(data as SunburstDataItem[]) ?? []}
          showLabels={settings.showLabels as boolean | undefined}
          sort={settings.sort as "desc" | "asc" | "none" | undefined}
          highlightOnHover={settings.highlightOnHover as boolean | undefined}
        />
      );

    case "radar": {
      const radarData = (data as RadarChartData) ?? { indicators: [], series: [] };
      return (
        <RadarChart
          data={radarData}
          shape={settings.shape as "polygon" | "circle" | undefined}
          filled={settings.filled as boolean | undefined}
          showLegend={settings.showLegend as boolean | undefined}
          showValues={settings.showValues as boolean | undefined}
        />
      );
    }

    case "treemap":
      return (
        <TreemapChart
          data={(data as TreemapDataItem[]) ?? []}
          showLabels={settings.showLabels as boolean | undefined}
          showBreadcrumb={settings.showBreadcrumb as boolean | undefined}
          showValues={settings.showValues as boolean | undefined}
          colorSaturation={settings.colorSaturation as "low" | "medium" | "high" | undefined}
        />
      );

    default:
      return (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8" />}
          title="Unknown chart type"
          description={`Chart type "${type}" is not supported.`}
          className="py-6"
        />
      );
  }
}
