"use client";

import { useWidgetQuery } from "@/hooks/use-widget-query";
import { getChartConfig } from "@/lib/chart-registry";
import { normalizeValue } from "@/lib/normalize-value";
import type { ChartType, ColumnMapping } from "@/lib/chart-registry";
import type { DashboardWidget, ClickAction } from "@/lib/db/schema";
import { useParameterStore } from "@/stores/parameter-store";
import React, { useMemo, useCallback, useRef, useState, useEffect } from "react";
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
  DataGridColumnHeader,
  DataGridViewOptions,
  DataGridPagination,
  ColumnMappingOverlay,
} from "@neoboard/components";
import { ParameterWidgetRenderer } from "@/components/parameter-widget-renderer";
import type { ParameterType } from "@/stores/parameter-store";

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

/** Chart types that support column mapping. */
const MAPPING_SUPPORTED_TYPES = new Set<ChartType>(["bar", "line", "pie"]);

interface CardContainerProps {
  widget: DashboardWidget;
  /** When provided, renders the chart from this data without executing a query. */
  previewData?: unknown;
  /** resultId from the query execution — passed through to chart components
   *  that need to detect when the underlying data changed (e.g. graph widget). */
  previewResultId?: string;
  /**
   * When true, the column mapping overlay is rendered for supported chart types.
   * The overlay allows in-place axis reassignment without re-running the query.
   */
  isEditMode?: boolean;
  /**
   * Called when the user changes the column mapping via the overlay.
   * The caller is responsible for persisting the updated settings.
   */
  onWidgetSettingsChange?: (settings: Record<string, unknown>) => void;
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
      const raw = data ?? 0;
      const val = typeof raw === "number" || typeof raw === "string" ? raw : normalizeValue(raw) ?? String(raw);
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
            parentParameterName={(settings.parentParameterName as string | undefined) || undefined}
            rangeMin={(settings.rangeMin as number | undefined) ?? 0}
            rangeMax={(settings.rangeMax as number | undefined) ?? 100}
            rangeStep={(settings.rangeStep as number | undefined) ?? 1}
            placeholder={(settings.placeholder as string | undefined) || undefined}
            searchable={(settings.searchable as boolean | undefined) ?? false}
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

  const enableSorting = settings.enableSorting !== false;

  const columns = useMemo((): ColumnDef<Record<string, unknown>, unknown>[] => {
    if (!records.length) return [];
    return Object.keys(records[0]).map((key) => ({
      id: key,
      accessorFn: (row: Record<string, unknown>) => row[key],
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title={key} />
      ),
      cell: ({ getValue }) => {
        const v = getValue();
        if (v === null || v === undefined)
          return <span className="text-muted-foreground">null</span>;
        const display =
          typeof v === "object" ? JSON.stringify(v) : String(v);
        return (
          <span className="block truncate max-w-[240px]" title={display}>
            {display}
          </span>
        );
      },
    }));
  }, [records, enableSorting]); // eslint-disable-line react-hooks/exhaustive-deps

  const emptyMessage = (settings.emptyMessage as string | undefined) ?? "No results";
  if (!records.length) {
    return <EmptyState title={emptyMessage} className="py-6" />;
  }

  // enablePagination defaults to true per chart-options-schema.
  const enablePagination = settings.enablePagination !== false;

  return (
    <div ref={containerRef} className="h-full overflow-y-auto">
      <DataGrid
        columns={columns}
        data={records as Record<string, unknown>[]}
        enableSorting={enableSorting}
        enableSelection={settings.enableSelection as boolean | undefined}
        enableGlobalFilter={settings.enableGlobalFilter !== false}
        enableColumnFilters={settings.enableColumnFilters !== false}
        enablePagination={enablePagination}
        pageSize={(settings.pageSize as number) ?? 10}
        containerHeight={enablePagination ? containerHeight : undefined}
        onRowClick={onRowClick}
        pagination={(table) => (
          <div className="flex items-center gap-2">
            <DataGridViewOptions table={table} />
            <div className="flex-1">
              <DataGridPagination table={table} />
            </div>
          </div>
        )}
      />
    </div>
  );
}


/**
 * Extracts column names from raw query result data.
 * Both Neo4j and PostgreSQL now return a flat Record[] array.
 */
function extractColumnNames(data: unknown): string[] {
  const records = Array.isArray(data) ? data : [];
  if (!records.length) return [];
  const first = records[0] as Record<string, unknown> | undefined;
  if (!first || typeof first !== "object") return [];
  return Object.keys(first);
}

/**
 * CardContainer: Fetches query results and renders the appropriate chart.
 * Uses React Query caching so queries are deduplicated across view->edit navigation.
 *
 * When `isEditMode` is true and the chart type is bar/line/pie, a lightweight
 * column mapping overlay is rendered at the bottom of the card, letting users
 * reassign axis columns without re-running the query.
 */
export function CardContainer({
  widget,
  previewData,
  previewResultId,
  isEditMode = false,
  onWidgetSettingsChange,
}: CardContainerProps) {
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
        .setParameter(parameterName, value, title, sourceField, "text", "click-action");
    }
  }
  const hasClickAction = !!(widget.settings?.clickAction as ClickAction | undefined);

  // Cache settings from widget config. Default: cache enabled, 5-min TTL.
  const enableCache = widget.settings?.enableCache !== false;
  const cacheTtlMinutes = (widget.settings?.cacheTtlMinutes as number | undefined) ?? 5;
  const staleTime = enableCache ? cacheTtlMinutes * 60_000 : 0;

  // Parameter-select widgets are self-contained (no query to run).
  const isParameterWidget = widget.chartType === "parameter-select";

  // Only fire the query when there's no previewData — useWidgetQuery handles
  // caching so navigating view->edit won't re-run the same query.
  // Parameter-select widgets skip query execution entirely.
  const queryInput = (previewData !== undefined || isParameterWidget) ? null : {
    connectionId: widget.connectionId,
    query: widget.query,
    params: widget.params as Record<string, unknown> | undefined,
  };
  const { missingParams, ...widgetQuery } = useWidgetQuery(queryInput, { staleTime });

  // Resolve the current column mapping from widget settings.
  const columnMapping = useMemo<ColumnMapping>(() => {
    const raw = widget.settings?.columnMapping;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as ColumnMapping;
    }
    return {};
  }, [widget.settings?.columnMapping]);

  // Determine whether to show the overlay.
  const showOverlay =
    isEditMode &&
    MAPPING_SUPPORTED_TYPES.has(widget.chartType as ChartType) &&
    !!onWidgetSettingsChange;

  const handleMappingChange = useCallback(
    (newMapping: ColumnMapping) => {
      if (!onWidgetSettingsChange) return;
      onWidgetSettingsChange({
        ...(widget.settings ?? {}),
        columnMapping: newMapping,
      });
    },
    [onWidgetSettingsChange, widget.settings]
  );

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
    const validationError = chartConfig.validate?.(previewData) ?? null;
    if (validationError) {
      return (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8" />}
          title="Incompatible data format"
          description={validationError}
          className="py-6"
        />
      );
    }
    const transformedData = chartConfig.transformWithMapping(previewData, columnMapping);
    const availableColumns = extractColumnNames(previewData);
    return (
      <div className="h-full w-full flex flex-col">
        <div className="flex-1 min-h-0">
          <ChartRenderer
            type={chartConfig.type}
            data={transformedData}
            settings={chartOptions}
            onChartClick={hasClickAction ? handleChartClick : undefined}
            connectionId={widget.connectionId}
            widgetId={widget.id}
            resultId={previewResultId}
          />
        </div>
        {showOverlay && (
          <ColumnMappingOverlay
            chartType={chartConfig.type as "bar" | "line" | "pie"}
            availableColumns={availableColumns}
            mapping={columnMapping}
            onMappingChange={handleMappingChange}
          />
        )}
      </div>
    );
  }

  // Parameter-select widgets are self-contained — skip query lifecycle
  if (isParameterWidget) {
    return (
      <div className="h-full w-full flex flex-col">
        <div className="flex-1 min-h-0">
          <ChartRenderer
            type={chartConfig.type}
            data={null}
            settings={chartOptions}
            connectionId={widget.connectionId}
            widgetId={widget.id}
          />
        </div>
      </div>
    );
  }

  // When enabled:false (params not yet set), TanStack Query returns
  // isPending:true + fetchStatus:"idle".  Show a friendly placeholder
  // instead of the loading skeleton so the user isn't confused by errors.
  if (widgetQuery.isPending && widgetQuery.fetchStatus === "idle") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">Waiting for parameters&hellip;</p>
          {missingParams.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {missingParams.map((name) => (
                <code key={name} className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
                  $param_{name}
                </code>
              ))}
            </div>
          )}
        </div>
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

  const rawData = widgetQuery.data.data;
  const validationError = chartConfig.validate?.(rawData) ?? null;
  if (validationError) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-8 w-8" />}
        title="Incompatible data format"
        description={validationError}
        className="py-6"
      />
    );
  }

  const transformedData = chartConfig.transformWithMapping(rawData, columnMapping);
  const availableColumns = extractColumnNames(rawData);

  return (
    <div className="h-full w-full flex flex-col">
      {widgetQuery.data?.truncated && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/50 border-b flex items-center gap-1.5">
          <span>&#9888;</span>
          <span>Showing first 10,000 rows. Refine your query to see all results.</span>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ChartRenderer
          type={chartConfig.type}
          data={transformedData}
          settings={chartOptions}
          onChartClick={hasClickAction ? handleChartClick : undefined}
          connectionId={widget.connectionId}
          widgetId={widget.id}
          resultId={widgetQuery.data.resultId}
        />
      </div>
      {showOverlay && (
        <ColumnMappingOverlay
          chartType={chartConfig.type as "bar" | "line" | "pie"}
          availableColumns={availableColumns}
          mapping={columnMapping}
          onMappingChange={handleMappingChange}
        />
      )}
    </div>
  );
}
