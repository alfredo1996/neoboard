"use client";

import { useQueryExecution } from "@/hooks/use-query-execution";
import { getChartConfig } from "@/lib/chart-registry";
import type { ChartType } from "@/lib/chart-registry";
import type { DashboardWidget } from "@/lib/db/schema";
import { useEffect, useMemo } from "react";
import { AlertCircle } from "lucide-react";
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
  GraphChart,
  MapChart,
  JsonViewer,
  DataGrid,
} from "@neoboard/components";
import type {
  BarChartDataPoint,
  LineChartDataPoint,
  PieChartDataPoint,
  GraphNode,
  GraphEdge,
  MapMarker,
} from "@neoboard/components";
import type { ColumnDef } from "@tanstack/react-table";

interface CardContainerProps {
  widget: DashboardWidget;
  /** When provided, renders the chart from this data without executing a query. */
  previewData?: unknown;
}

/**
 * Renders the appropriate chart component based on widget type and data.
 */
function ChartRenderer({ type, data }: { type: ChartType; data: unknown }) {
  switch (type) {
    case "bar":
      return <BarChart data={(data as BarChartDataPoint[]) ?? []} />;

    case "line":
      return <LineChart data={(data as LineChartDataPoint[]) ?? []} />;

    case "pie":
      return <PieChart data={(data as PieChartDataPoint[]) ?? []} />;

    case "single-value": {
      const val = data ?? 0;
      return (
        <SingleValueChart
          value={typeof val === "number" || typeof val === "string" ? val : String(val)}
        />
      );
    }

    case "graph": {
      const graphData = (data ?? { nodes: [], edges: [] }) as {
        nodes: GraphNode[];
        edges: GraphEdge[];
      };
      return (
        <GraphChart
          nodes={graphData.nodes ?? []}
          edges={graphData.edges ?? []}
        />
      );
    }

    case "map": {
      const markers = (data ?? []) as MapMarker[];
      return <MapChart markers={markers} autoFitBounds />;
    }

    case "table":
      return <TableRenderer data={data} />;

    case "json":
      return (
        <div className="h-full overflow-auto">
          <JsonViewer data={data} initialExpanded={2} />
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
 */
function TableRenderer({ data }: { data: unknown }) {
  const records = Array.isArray(data) ? data : [];

  const columns = useMemo((): ColumnDef<Record<string, unknown>, unknown>[] => {
    if (!records.length) return [];
    return Object.keys(records[0]).map((key) => ({
      accessorKey: key,
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

  return (
    <div className="h-full overflow-auto">
      <DataGrid
        columns={columns}
        data={records as Record<string, unknown>[]}
        enableSorting
        pageSize={20}
      />
    </div>
  );
}

/**
 * CardContainer: Fetches query results and renders the appropriate chart.
 */
export function CardContainer({ widget, previewData }: CardContainerProps) {
  const queryExecution = useQueryExecution();
  const chartConfig = getChartConfig(widget.chartType);

  useEffect(() => {
    if (previewData !== undefined) return; // Skip query when preview data is provided
    if (widget.connectionId && widget.query) {
      queryExecution.mutate({
        connectionId: widget.connectionId,
        query: widget.query,
        params: widget.params as Record<string, unknown> | undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.connectionId, widget.query, previewData]);

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

  // Use preview data directly if provided
  if (previewData !== undefined) {
    const transformedData = chartConfig.transform(previewData);
    return (
      <div className="h-full w-full">
        <ChartRenderer type={chartConfig.type} data={transformedData} />
      </div>
    );
  }

  if (queryExecution.isPending) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (queryExecution.isError) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {queryExecution.error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!queryExecution.data) {
    return (
      <EmptyState
        title="No data"
        description="No data returned from the query."
        className="py-6"
      />
    );
  }

  const transformedData = chartConfig.transform(queryExecution.data.data);

  return (
    <div className="h-full w-full">
      <ChartRenderer type={chartConfig.type} data={transformedData} />
    </div>
  );
}
