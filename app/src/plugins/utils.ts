/**
 * Shared utilities for chart plugins.
 */

import { useMemo } from "react";
import type { EChartsClickEvent } from "@neoboard/components";

/**
 * Standard plugin component props passed by chart-renderer.tsx.
 * Each plugin picks the subset it needs.
 */
export interface PluginProps {
  data: unknown;
  settings: Record<string, unknown>;
  stylingRules?: unknown[];
  paramValues?: Record<string, unknown>;
  colorScales?: unknown[];
  onChartClick?: (point: Record<string, unknown>) => void;
  connectionId?: string;
  widgetId?: string;
  resultId?: string;
  query?: string;
  autoFit?: boolean;
  clickableColumns?: string[];
  colorThresholds?: string;
}

/**
 * Creates an ECharts-compatible onClick handler from the plugin's
 * raw `onChartClick` callback. Enriches the ECharts event with the
 * original data row so column-name source fields resolve correctly.
 *
 * Usage inside an ECharts plugin component:
 *   const onClick = useEChartsClick(onChartClick, data);
 *   <BarChart onClick={onClick} ... />
 */
export function useEChartsClick(
  onChartClick: ((point: Record<string, unknown>) => void) | undefined,
  data: unknown,
): ((e: EChartsClickEvent) => void) | undefined {
  return useMemo(() => {
    if (!onChartClick) return undefined;
    return (e: EChartsClickEvent) => {
      const row = Array.isArray(data)
        ? (data[e.dataIndex] as Record<string, unknown> | undefined)
        : undefined;
      onChartClick({
        ...(row ?? {}),
        name: e.name,
        value: e.value,
        seriesName: e.seriesName,
        dataIndex: e.dataIndex,
      });
    };
  }, [onChartClick, data]);
}
