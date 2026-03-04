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
} from "@neoboard/components";
import type { ColumnDef } from "@tanstack/react-table";

export interface TableRendererProps {
  data: unknown;
  settings?: Record<string, unknown>;
  onCellClick?: (info: { column: string; value: unknown }) => void;
  /** Restrict which columns are clickable. Empty/undefined = all columns. */
  clickableColumns?: string[];
}

/**
 * Auto-generates columns and renders DataGrid from query result records.
 * Uses a ResizeObserver on the wrapper div to pass a live containerHeight so
 * DataGrid can calculate the dynamic page size automatically.
 */
export function TableRenderer({ data, settings = {}, onCellClick, clickableColumns }: TableRendererProps) {
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
  }, [records]);

  const thresholds = useMemo(() => {
    const raw =
      typeof settings.colorThresholds === "string"
        ? settings.colorThresholds
        : "";
    return parseColorThresholds(raw);
  }, [settings.colorThresholds]);

  const thresholdColumn =
    typeof settings.colorThresholdsColumn === "string" ? settings.colorThresholdsColumn : "";

  // Compute a single fallback numeric column once so every row is colored consistently.
  const fallbackThresholdColumn = useMemo(() => {
    if (!records.length) return undefined;
    return Object.keys(records[0]).find(
      (k) => typeof (records[0] as Record<string, unknown>)[k] === "number",
    );
  }, [records]);

  const emptyMessage = (settings.emptyMessage as string | undefined) ?? "No results";
  if (!records.length) {
    return <EmptyState title={emptyMessage} className="py-6" />;
  }

  // enablePagination defaults to true per chart-options-schema.
  const enablePagination = settings.enablePagination !== false;

  const getRowStyle =
    thresholds.length > 0
      ? (row: Record<string, unknown>): React.CSSProperties | undefined => {
          const col =
            thresholdColumn && thresholdColumn in row
              ? thresholdColumn
              : fallbackThresholdColumn;
          if (!col) return undefined;
          const val = row[col];
          if (typeof val !== "number") return undefined;
          const color = resolveThresholdColor(val, thresholds);
          return color ? { backgroundColor: color } : undefined;
        }
      : undefined;

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
        onCellClick={onCellClick}
        clickableColumns={clickableColumns}
        getRowStyle={getRowStyle}
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
