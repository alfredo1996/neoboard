"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  EmptyState,
  DataGrid,
  DataGridColumnHeader,
  DataGridViewOptions,
  DataGridPagination,
  parseColorThresholds,
  resolveThresholdColor,
  resolveStylingRuleColor,
  interpolateColor,
  contrastTextColor,
} from "@neoboard/components";
import type { StylingRule, ColorScaleConfig } from "@neoboard/components";
import type { ColumnDef } from "@tanstack/react-table";
import { parseGroupByColumns } from "@/lib/widget/table-utils";

const AGG_SYMBOLS: Record<string, string> = {
  sum: "Σ",
  mean: "μ",
  median: "M̃",
  count: "#",
  min: "min",
  max: "max",
};

export interface TableRendererProps {
  data: unknown;
  settings?: Record<string, unknown>;
  onCellClick?: (info: { column: string; value: unknown }) => void;
  /** Restrict which columns are clickable. Empty/undefined = all columns. */
  clickableColumns?: string[];
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
  /** Color scale configs for gradient cell backgrounds */
  colorScales?: ColorScaleConfig[];
}

/**
 * Auto-generates columns and renders DataGrid from query result records.
 * Uses a ResizeObserver on the wrapper div to pass a live containerHeight so
 * DataGrid can calculate the dynamic page size automatically.
 */
export function TableRenderer({
  data,
  settings = {},
  onCellClick,
  clickableColumns,
  stylingRules,
  paramValues,
  colorScales,
}: TableRendererProps) {
  const records = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number | undefined>(
    undefined,
  );

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
  const enableColumnResizing = settings.enableColumnResizing === true;
  const enableGrouping = settings.enableGrouping === true;
  const initialGrouping = useMemo(
    () => parseGroupByColumns(enableGrouping, settings.groupBy as string),
    [enableGrouping, settings.groupBy],
  );

  const aggregationFn = ((settings.aggregationFn as string) || "sum") as
    | "sum"
    | "mean"
    | "median"
    | "count"
    | "min"
    | "max";

  const columns = useMemo((): ColumnDef<Record<string, unknown>, unknown>[] => {
    if (!records.length) return [];
    const aggSymbol = AGG_SYMBOLS[aggregationFn] ?? "Σ";
    return Object.keys(records[0]).map((key) => {
      // Detect numeric columns for automatic aggregation in grouped mode
      const isNumeric = records.some(
        (r) => typeof (r as Record<string, unknown>)[key] === "number",
      );
      return {
        id: key,
        accessorFn: (row: Record<string, unknown>) => row[key],
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title={key} />
        ),
        cell: ({ getValue }) => {
          const v = getValue();
          if (v === null || v === undefined)
            return <span className="text-muted-foreground">null</span>;
          const display = typeof v === "object" ? JSON.stringify(v) : String(v);
          return (
            <span className="block truncate max-w-[240px]" title={display}>
              {display}
            </span>
          );
        },
        ...(enableGrouping && isNumeric
          ? {
              aggregationFn,
              aggregatedCell: ({ getValue }: { getValue: () => unknown }) => {
                const v = getValue();
                return v != null ? (
                  <span className="text-muted-foreground text-xs font-medium">
                    {aggSymbol}{" "}
                    {typeof v === "number" ? v.toLocaleString() : String(v)}
                  </span>
                ) : null;
              },
            }
          : {}),
      };
    });
  }, [records, enableGrouping, aggregationFn]);

  const thresholds = useMemo(() => {
    const raw =
      typeof settings.colorThresholds === "string"
        ? settings.colorThresholds
        : "";
    return parseColorThresholds(raw);
  }, [settings.colorThresholds]);

  const thresholdColumn =
    typeof settings.colorThresholdsColumn === "string"
      ? settings.colorThresholdsColumn
      : "";

  // Compute a single fallback numeric column once so every row is colored consistently.
  const fallbackThresholdColumn = useMemo(() => {
    if (!records.length) return undefined;
    return Object.keys(records[0]).find(
      (k) => typeof (records[0] as Record<string, unknown>)[k] === "number",
    );
  }, [records]);

  // enablePagination defaults to true per chart-options-schema.
  const enablePagination = settings.enablePagination !== false;

  const getRowStyle = useMemo(() => {
    if (stylingRules?.length) {
      // Fallback column for rules without an explicit column
      const defaultCol = thresholdColumn || fallbackThresholdColumn;
      return (
        row: Record<string, unknown>,
      ): React.CSSProperties | undefined => {
        const style: React.CSSProperties = {};
        let hasStyle = false;

        // Process all rules in order — later rules override earlier ones
        // (last matching rule wins, giving higher-priority rules precedence
        // when placed later in the list)
        for (const rule of stylingRules) {
          const ruleCol = rule.column || defaultCol;
          if (!ruleCol || !(ruleCol in row)) continue;
          const val = row[ruleCol];
          const color = resolveStylingRuleColor(val, [rule], paramValues);
          if (!color) continue;
          const target = rule.target || "backgroundColor";
          if (target === "backgroundColor") {
            style.backgroundColor = color;
            hasStyle = true;
          }
          if (target === "textColor") {
            style.color = color;
            hasStyle = true;
          }
          if (rule.bold) {
            style.fontWeight = "bold";
            hasStyle = true;
          }
        }
        // Auto-set text color for contrast when background is set but no explicit text color rule matched
        if (
          style.backgroundColor &&
          !stylingRules.some((r) => r.target === "textColor")
        ) {
          style.color = contrastTextColor(style.backgroundColor as string);
        }
        return hasStyle ? style : undefined;
      };
    }
    if (thresholds.length > 0) {
      return (
        row: Record<string, unknown>,
      ): React.CSSProperties | undefined => {
        const col =
          thresholdColumn && thresholdColumn in row
            ? thresholdColumn
            : fallbackThresholdColumn;
        if (!col) return undefined;
        const val = row[col];
        if (typeof val !== "number") return undefined;
        const color = resolveThresholdColor(val, thresholds);
        if (!color) return undefined;
        return { backgroundColor: color, color: contrastTextColor(color) };
      };
    }
    return undefined;
  }, [
    stylingRules,
    paramValues,
    thresholds,
    thresholdColumn,
    fallbackThresholdColumn,
  ]);

  // Compute per-column min/max for color scales
  const columnMinMax = useMemo(() => {
    if (!colorScales?.length || !records.length)
      return new Map<string, { min: number; max: number }>();
    const result = new Map<string, { min: number; max: number }>();
    for (const scale of colorScales) {
      let min = Infinity;
      let max = -Infinity;
      for (const row of records) {
        const raw = (row as Record<string, unknown>)[scale.column];
        if (
          raw === null ||
          raw === undefined ||
          raw === "" ||
          (typeof raw === "string" && !raw.trim())
        )
          continue;
        const val = Number(raw);
        if (!Number.isNaN(val)) {
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }
      if (min !== Infinity) result.set(scale.column, { min, max });
    }
    return result;
  }, [colorScales, records]);

  const getCellStyle = useMemo(() => {
    if (!colorScales?.length) return undefined;
    return (
      row: Record<string, unknown>,
      columnId: string,
    ): React.CSSProperties | undefined => {
      const scale = colorScales.find((s) => s.column === columnId);
      if (!scale) return undefined;
      const bounds = columnMinMax.get(columnId);
      if (!bounds) return undefined;
      const val = Number(row[columnId]);
      if (Number.isNaN(val)) return undefined;
      const bg = interpolateColor(
        val,
        bounds.min,
        bounds.max,
        scale.minColor,
        scale.maxColor,
      );
      return { backgroundColor: bg, color: contrastTextColor(bg) };
    };
  }, [colorScales, columnMinMax]);

  const emptyMessage =
    (settings.emptyMessage as string | undefined) ?? "No results";
  if (!records.length) {
    return <EmptyState title={emptyMessage} className="py-6" />;
  }

  // Avoid the pagination "flash" on first render: when pagination is enabled
  // we depend on the measured container height to compute the page size. If
  // we render before the ResizeObserver fires, DataGrid mounts with the
  // default `pageSize=10`, then immediately re-renders with the dynamic size —
  // which visibly snaps the row count. Render an empty wrapper on the first
  // tick instead so the observer can measure, then commit a single DataGrid.
  // Treat 0/negative as "not ready" too — the wrapper can momentarily measure
  // to 0 before layout settles, which would otherwise trigger the same snap.
  const hasUsableHeight = containerHeight !== undefined && containerHeight > 0;
  const awaitingHeight = enablePagination && !hasUsableHeight;

  // Derive a screen-reader description from data shape — the underlying
  // <table> has no top-level label and the wrapper is otherwise just a
  // scroll container, so AT users hit it with no context.
  const columnCount = records.length ? Object.keys(records[0]).length : 0;
  const ariaLabel =
    (settings.ariaLabel as string | undefined) ??
    `Table with ${records.length} rows and ${columnCount} columns`;

  return (
    <section
      ref={containerRef}
      className="h-full overflow-y-auto"
      aria-label={ariaLabel}
    >
      {awaitingHeight ? null : (
        <DataGrid
          key={enableGrouping ? `grp-${aggregationFn}` : undefined}
          columns={columns}
          data={records as Record<string, unknown>[]}
          enableSorting={enableSorting}
          enableColumnResizing={enableColumnResizing}
          enableSelection={settings.enableSelection as boolean | undefined}
          enableColumnFilters={settings.enableColumnFilters !== false}
          enablePagination={enablePagination}
          pageSize={(settings.pageSize as number) ?? 10}
          containerHeight={
            enablePagination && hasUsableHeight ? containerHeight : undefined
          }
          onCellClick={onCellClick}
          clickableColumns={clickableColumns}
          getRowStyle={getRowStyle}
          getCellStyle={getCellStyle}
          enableGrouping={enableGrouping}
          initialGrouping={initialGrouping}
          pagination={(table) => (
            <div className="flex items-center gap-2">
              <DataGridViewOptions table={table} />
              <div className="flex-1">
                <DataGridPagination table={table} />
              </div>
            </div>
          )}
        />
      )}
    </section>
  );
}
