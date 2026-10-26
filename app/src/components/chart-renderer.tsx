"use client";

import React from "react";
import { pluginRegistry } from "@/plugins";
import { ChartErrorBoundary } from "./chart-error-boundary";
import { EmptyState } from "@neoboard/components";
import type { StylingRule, ColorScaleConfig } from "@neoboard/components";

/** Styling-related props grouped together. */
export interface ChartStylingProps {
  rules?: StylingRule[];
  paramValues?: Record<string, unknown>;
  colorScales?: ColorScaleConfig[];
}

/** Interaction-related props grouped together. */
export interface ChartInteractionProps {
  onChartClick?: (point: Record<string, unknown>) => void;
  clickableColumns?: string[];
  /** Mark names the widget's own click action has selected (#2226). */
  highlighted?: unknown[];
}

/** Widget metadata props grouped together. */
export interface ChartMetaProps {
  connectionId?: string;
  /** The widget's saved per-card database, for requests a plugin makes (#1824). */
  database?: string;
  widgetId?: string;
  resultId?: string;
  /** The connector that ran the query (#2061). */
  connectorType?: string;
  query?: string;
  autoFit?: boolean;
}

export interface ChartRendererProps {
  type: string;
  data: unknown;
  settings?: Record<string, unknown>;
  styling?: ChartStylingProps;
  interaction?: ChartInteractionProps;
  meta?: ChartMetaProps;
}

/**
 * Renders the appropriate chart component based on widget type and data.
 * Wrapped in an error boundary so one broken widget doesn't crash the dashboard.
 */
export function ChartRenderer(props: ChartRendererProps) {
  return (
    <ChartErrorBoundary
      chartType={props.type}
      key={`${props.type}-${props.meta?.widgetId ?? ""}`}
    >
      <ChartRendererInner {...props} />
    </ChartErrorBoundary>
  );
}

function ChartRendererInner({
  type,
  data,
  settings = {},
  styling,
  interaction,
  meta,
}: ChartRendererProps) {
  const { rules: stylingRules, paramValues, colorScales } = styling ?? {};
  const { onChartClick, clickableColumns, highlighted } = interaction ?? {};
  const {
    connectionId,
    database,
    widgetId,
    resultId,
    connectorType,
    query,
    autoFit,
  } = meta ?? {};
  const colorThresholds =
    typeof settings.colorThresholds === "string"
      ? settings.colorThresholds
      : undefined;

  // Plugin-driven rendering — every chart type is registered as a plugin
  // in app/src/plugins/. The plugin's component receives the full set of
  // props; it picks the ones it needs.
  const plugin = pluginRegistry.get(type);
  if (plugin) {
    const PluginComponent = plugin.component;
    // Pass onChartClick (the raw row-level callback) to all plugins.
    // ECharts-based plugins wrap it in their own ECharts event handler
    // internally — this keeps the plugin contract to ONE callback.
    return (
      <PluginComponent
        data={data}
        settings={settings}
        stylingRules={stylingRules}
        paramValues={paramValues}
        colorScales={colorScales}
        onChartClick={onChartClick}
        connectionId={connectionId}
        database={database}
        widgetId={widgetId}
        resultId={resultId}
        connectorType={connectorType}
        query={query}
        autoFit={autoFit}
        clickableColumns={clickableColumns}
        highlighted={highlighted}
        colorThresholds={colorThresholds}
      />
    );
  }

  return (
    <EmptyState
      title="Unknown chart type"
      description={`Chart type "${type}" is not supported.`}
      className="py-6"
    />
  );
}
