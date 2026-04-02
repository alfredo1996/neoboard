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
} from "@neoboard/components";
import type { StylingRule, ColorScaleConfig } from "@neoboard/components";
import type { ColumnDef } from "@tanstack/react-table";
import { parseGroupByColumns } from "@/lib/table-utils";

const AGG_SYMBOLS: Record<string, string> = {
  sum: "Σ",
  mean: "μ",
  median: "M̃",
  count: "#",
  min: "min",
  max: "max",
};

/** Return black or white text based on background luminance for readability. */
function contrastTextColor(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  // Relative luminance (WCAG formula)
  const lum =
    0.2126 * (r <= 0.03928 ? r / 12.92 : ((r + 0.055) / 1.055) ** 2.4) +
    0.7152 * (g <= 0.03928 ? g / 12.92 : ((g + 0.055) / 1.055) ** 2.4) +
    0.0722 * (b <= 0.03928 ? b / 12.92 : ((b + 0.055) / 1.055) ** 2.4);
  return lum > 0.179 ? "#000000" : "#ffffff";
}

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
        let bgSet = false;
        let textSet = false;
        let boldSet = false;

        for (const rule of stylingRules) {
          if (bgSet && textSet && boldSet) break;
          const ruleCol = rule.column || defaultCol;
          if (!ruleCol || !(ruleCol in row)) continue;
          const val = row[ruleCol];
          const color = resolveStylingRuleColor(val, [rule], paramValues);
          if (!color) continue;
          const target = rule.target || "backgroundColor";
          if (target === "backgroundColor" && !bgSet) {
            style.backgroundColor = color;
            bgSet = true;
            hasStyle = true;
          }
          if (target === "textColor" && !textSet) {
            style.color = color;
            textSet = true;
            hasStyle = true;
          }
          if (rule.bold && !boldSet) {
            style.fontWeight = "bold";
            boldSet = true;
            hasStyle = true;
          }
        }
        // Auto-set text color for contrast when background is set but text color isn't
        if (bgSet && !textSet) {
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

  return (
    <div ref={containerRef} className="h-full overflow-y-auto">
      <DataGrid
        key={enableGrouping ? `grp-${aggregationFn}` : undefined}
        columns={columns}
        data={records as Record<string, unknown>[]}
        enableSorting={enableSorting}
        enableColumnResizing={enableColumnResizing}
        enableSelection={settings.enableSelection as boolean | undefined}
        enableGlobalFilter={settings.enableGlobalFilter !== false}
        enableColumnFilters={settings.enableColumnFilters !== false}
        enablePagination={enablePagination}
        pageSize={(settings.pageSize as number) ?? 10}
        containerHeight={enablePagination ? containerHeight : undefined}
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
    </div>
  );
}
