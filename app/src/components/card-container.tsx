"use client";

import { useWidgetQuery } from "@/hooks/use-widget-query";
import { getChartConfig } from "@/lib/chart-registry";
import type { ChartType } from "@/lib/chart-registry";
import type { DashboardWidget, ClickAction } from "@/lib/db/schema";
import { useParameterStore } from "@/stores/parameter-store";
import { useMemo, useRef, useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import dynamic from "next/dynamic";
import {
  Skeleton,
  Alert,
  AlertDescription,
  AlertTitle,
} from "@neoboard/components";
import {
  EmptyState,
  BarChart,
  LineChart,
  PieChart,
  SingleValueChart,
  JsonViewer,
  DataGrid,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
} from "@neoboard/components";

// Lazy-load GraphChart so NVL (WebGL) is only bundled when a graph widget is rendered
const GraphChart = dynamic(
  () => import("@neoboard/components").then((mod) => ({ default: mod.GraphChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> }
);
import { GraphExplorationWrapper } from "./graph-exploration-wrapper";

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
import type {
  BarChartDataPoint,
  LineChartDataPoint,
  PieChartDataPoint,
  GraphNode,
  GraphEdge,
  MapMarker,
  EChartsClickEvent,
} from "@neoboard/components";
import type { ColumnDef } from "@tanstack/react-table";

interface CardContainerProps {
  widget: DashboardWidget;
  /** When provided, renders the chart from this data without executing a query. */
  previewData?: unknown;
  /** resultId from the query execution — passed through to chart components
   *  that need to detect when the underlying data changed (e.g. graph widget). */
  previewResultId?: string;
}

interface ChartRendererProps {
  type: ChartType;
  data: unknown;
  settings?: Record<string, unknown>;
  onChartClick?: (point: Record<string, unknown>) => void;
  connectionId?: string;
  widgetId?: string;
  resultId?: string;
}

/**
 * Renders the appropriate chart component based on widget type and data.
 * Forwards chart-specific settings as props to the underlying chart component.
 */
function ChartRenderer({ type, data, settings = {}, onChartClick, connectionId, widgetId, resultId }: ChartRendererProps) {
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
          onClick={handleEChartsClick}
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
          onClick={handleEChartsClick}
        />
      );

    case "pie":
      return (
        <PieChart
          data={(data as PieChartDataPoint[]) ?? []}
          donut={settings.donut as boolean | undefined}
          showLabel={settings.showLabel as boolean | undefined}
          showLegend={settings.showLegend as boolean | undefined}
          onClick={handleEChartsClick}
        />
      );

    case "single-value": {
      const val = data ?? 0;
      return (
        <SingleValueChart
          value={typeof val === "number" || typeof val === "string" ? val : String(val)}
          title={settings.title as string | undefined}
          prefix={settings.prefix as string | undefined}
          suffix={settings.suffix as string | undefined}
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
      return <TableRenderer data={data} settings={settings} onRowClick={onChartClick} />;

    case "parameter-select":
      return (
        <ParameterSelectRenderer
          data={data}
          parameterName={settings.parameterName as string | undefined}
        />
      );

    case "json":
      return (
        <div className="h-full overflow-auto">
          <JsonViewer
            data={data}
            initialExpanded={(settings.initialExpanded as number) ?? 2}
          />
        </div>
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

/**
 * Auto-generates columns and renders DataGrid from query result records.
 * Uses a ResizeObserver on the wrapper div to pass a live containerHeight so
 * DataGrid can calculate the dynamic page size automatically.
 */
function TableRenderer({ data, settings = {}, onRowClick }: { data: unknown; settings?: Record<string, unknown>; onRowClick?: (row: Record<string, unknown>) => void }) {
  const records = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number | undefined>(undefined);

  // Track the container's height so DataGrid can compute the page size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    // Capture the initial height before the first ResizeObserver callback.
    setContainerHeight(el.getBoundingClientRect().height);

    return () => observer.disconnect();
  }, []);

  const columns = useMemo((): ColumnDef<Record<string, unknown>, unknown>[] => {
    if (!records.length) return [];
    return Object.keys(records[0]).map((key) => ({
      id: key,
      accessorFn: (row: Record<string, unknown>) => row[key],
      header: key,
      cell: ({ getValue }) => {
        const v = getValue();
        if (v === null || v === undefined) return <span className="text-muted-foreground">null</span>;
        if (typeof v === "object") return JSON.stringify(v);
        return String(v);
      },
    }));
  }, [records]);

  if (!records.length) {
    return <EmptyState title="No rows" description="Query returned no data." className="py-6" />;
  }

  // enablePagination defaults to true per chart-options-schema.
  const enablePagination = settings.enablePagination !== false;

  return (
    <div ref={containerRef} className="h-full overflow-hidden">
      <DataGrid
        columns={columns}
        data={records as Record<string, unknown>[]}
        enableSorting={settings.enableSorting !== false}
        enableSelection={settings.enableSelection as boolean | undefined}
        enableGlobalFilter={settings.enableGlobalFilter !== false}
        enableColumnFilters={settings.enableColumnFilters !== false}
        enablePagination={enablePagination}
        pageSize={(settings.pageSize as number) ?? 20}
        containerHeight={enablePagination ? containerHeight : undefined}
        onRowClick={onRowClick}
      />
    </div>
  );
}

/**
 * Renders a dropdown select that sets a parameter value from query results.
 */
function ParameterSelectRenderer({
  data,
  parameterName,
}: {
  data: unknown;
  parameterName?: string;
}) {
  const options = Array.isArray(data) ? data : [];
  const setParameter = useParameterStore((s) => s.setParameter);
  const currentValue = useParameterStore((s) => {
    if (!parameterName) return undefined;
    return s.parameters[parameterName]?.value;
  });

  if (!parameterName) {
    return (
      <EmptyState
        title="No parameter name"
        description="Configure a parameter name in the widget settings."
        className="py-6"
      />
    );
  }

  return (
    <div className="p-4 space-y-2">
      <Label>{parameterName}</Label>
      <Select
        value={currentValue !== undefined ? String(currentValue) : ""}
        onValueChange={(val) =>
          setParameter(parameterName, val, "Parameter Selector", parameterName)
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a value..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt, i) => (
            <SelectItem key={`${opt}-${i}`} value={String(opt)}>
              {String(opt)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * CardContainer: Fetches query results and renders the appropriate chart.
 * Uses React Query caching so queries are deduplicated across view→edit navigation.
 */
export function CardContainer({ widget, previewData, previewResultId }: CardContainerProps) {
  const chartConfig = getChartConfig(widget.chartType);

  function handleChartClick(point: Record<string, unknown>) {
    const clickAction = widget.settings?.clickAction as ClickAction | undefined;
    if (!clickAction || clickAction.type !== "set-parameter") return;
    const { parameterName, sourceField } = clickAction.parameterMapping;
    const value = point[sourceField];
    if (value !== undefined) {
      const title = (widget.settings?.title as string) || chartConfig?.label || widget.chartType;
      useParameterStore
        .getState()
        .setParameter(parameterName, value, title, sourceField);
    }
  }
  const hasClickAction = !!(widget.settings?.clickAction as ClickAction | undefined);

  // Cache settings from widget config. Default: cache enabled, 5-min TTL.
  const enableCache = widget.settings?.enableCache !== false;
  const cacheTtlMinutes = (widget.settings?.cacheTtlMinutes as number | undefined) ?? 5;
  const staleTime = enableCache ? cacheTtlMinutes * 60_000 : 0;

  // Only fire the query when there's no previewData — useWidgetQuery handles
  // caching so navigating view→edit won't re-run the same query.
  const queryInput = previewData !== undefined ? null : {
    connectionId: widget.connectionId,
    query: widget.query,
    params: widget.params as Record<string, unknown> | undefined,
  };
  const widgetQuery = useWidgetQuery(queryInput, { staleTime });

  if (!chartConfig) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-8 w-8" />}
        title="Unknown chart type"
        description={`Chart type "${widget.chartType}" is not supported.`}
        className="py-6"
      />
    );
  }

  const chartOptions = (widget.settings?.chartOptions ?? {}) as Record<string, unknown>;

  // Use preview data directly if provided
  if (previewData !== undefined) {
    const transformedData = chartConfig.transform(previewData);
    return (
      <div className="h-full w-full">
        <ChartRenderer type={chartConfig.type} data={transformedData} settings={chartOptions} onChartClick={hasClickAction ? handleChartClick : undefined} connectionId={widget.connectionId} widgetId={widget.id} resultId={previewResultId} />
      </div>
    );
  }

  if (widgetQuery.isPending) {
    return (
      <div data-loading="true" className="space-y-3 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (widgetQuery.isError) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Query Failed</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>{widgetQuery.error.message}</p>
            <p className="text-xs font-mono opacity-70 truncate" title={widget.query}>
              {widget.query}
            </p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!widgetQuery.data) {
    return (
      <EmptyState
        title="No data"
        description="No data returned from the query."
        className="py-6"
      />
    );
  }

  const transformedData = chartConfig.transform(widgetQuery.data.data);

  return (
    <div className="h-full w-full">
      <ChartRenderer type={chartConfig.type} data={transformedData} settings={chartOptions} onChartClick={hasClickAction ? handleChartClick : undefined} connectionId={widget.connectionId} widgetId={widget.id} resultId={widgetQuery.data.resultId} />
    </div>
  );
}
