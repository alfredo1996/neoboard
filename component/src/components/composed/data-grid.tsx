import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getGroupedRowModel,
  getExpandedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type {
  ColumnDef,
  SortingState,
  VisibilityState,
  RowSelectionState,
  ColumnFiltersState,
  GroupingState,
  ExpandedState,
  Table,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight, ChevronsDownUp } from "lucide-react";
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatNumber,
  type NumberFormat,
  type NumberFormatConfig,
} from "@/charts/chart-utils";

export type DataGridColumn<TData> = ColumnDef<TData, unknown>;

/**
 * Fixed layout heights used when computing the dynamic page size from a
 * known container height.  Keep in sync with the actual rendered heights.
 */
export const DATA_GRID_HEADER_HEIGHT = 40; // px — table <thead> row
export const DATA_GRID_ROW_HEIGHT = 36; // px — single data <tr>
export const DATA_GRID_PAGINATION_HEIGHT = 52; // px — pagination control bar

/**
 * Calculate how many rows fit in the available container space.
 *
 * @param containerHeight - Total pixel height of the widget container.
 * @param toolbarHeight   - Height of the toolbar above the table (0 when no toolbar).
 * @returns The number of rows that fit, always at least 1.
 */
export function calcDynamicPageSize(
  containerHeight: number,
  toolbarHeight = 0,
): number {
  const availableForRows =
    containerHeight -
    toolbarHeight -
    DATA_GRID_HEADER_HEIGHT -
    DATA_GRID_PAGINATION_HEIGHT;
  return Math.max(1, Math.floor(availableForRows / DATA_GRID_ROW_HEIGHT));
}

export interface DataGridProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  enableSorting?: boolean;
  enableSelection?: boolean;
  enableGlobalFilter?: boolean;
  enableColumnFilters?: boolean;
  /**
   * Whether to show pagination controls.  Defaults to `true`.
   * When `false` all rows are rendered on a single page.
   */
  /** Allow drag-to-resize column borders. */
  enableColumnResizing?: boolean;
  enablePagination?: boolean;
  /**
   * Fixed fallback page size used when `containerHeight` is not provided or
   * when `enablePagination` is `false`.
   */
  pageSize?: number;
  /**
   * Height of the outer widget container in pixels.  When provided and
   * `enablePagination` is `true`, the page size is calculated dynamically so
   * that exactly as many rows as fit are shown — no overflow, no wasted space.
   */
  containerHeight?: number;
  onCellClick?: (info: { column: string; value: unknown }) => void;
  /** Restrict which columns are clickable. Empty/undefined = all columns. */
  clickableColumns?: string[];
  onSelectionChange?: (selectedRows: TData[]) => void;
  /** Optional function to compute a row's inline style (e.g. background color from threshold). */
  getRowStyle?: (row: TData) => React.CSSProperties | undefined;
  /** Optional function to compute a cell's inline style for conditional formatting. */
  getCellStyle?: (
    row: TData,
    columnId: string,
  ) => React.CSSProperties | undefined;
  /** Enable row grouping. When true, columns with `enableGrouping` can be used for grouping. */
  enableGrouping?: boolean;
  /** Column IDs to group by initially. Requires `enableGrouping`. */
  initialGrouping?: string[];
  toolbar?: (table: Table<TData>) => React.ReactNode;
  pagination?: (table: Table<TData>) => React.ReactNode;
  className?: string;
  /**
   * Table-wide number format applied to every numeric cell that does not
   * have a custom `cell` renderer in its column definition. #910/#911.
   * Falls through to the formatNumber default (comma + 2dp) when omitted.
   */
  numberFormat?: NumberFormat;
  /** Table-wide decimal places for numeric cells. See `numberFormat`. */
  decimalPlaces?: number;
}

function DataGrid<TData>({
  columns,
  data,
  enableSorting = false,
  enableSelection = false,
  enableGlobalFilter = false,
  enableColumnFilters = false,
  enableColumnResizing = false,
  enablePagination = true,
  pageSize = 10,
  containerHeight,
  onCellClick,
  clickableColumns,
  onSelectionChange,
  getRowStyle,
  getCellStyle,
  enableGrouping = false,
  initialGrouping,
  toolbar,
  pagination,
  className,
  numberFormat,
  decimalPlaces,
}: DataGridProps<TData>) {
  // Table cells always want comma formatting (it's tabular data — commas
  // are the universal Excel-like convention). When the caller doesn't
  // override numberFormat, force "comma". For decimalPlaces, defer to
  // formatNumber's smart default (2dp) when both are unset.
  const numberFormatConfig: NumberFormatConfig =
    numberFormat === undefined && decimalPlaces === undefined
      ? {} // both unset → formatNumber applies comma + 2dp
      : {
          numberFormat: numberFormat ?? "comma",
          ...(decimalPlaces !== undefined && { decimalPlaces }),
        };
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [grouping, setGrouping] = React.useState<GroupingState>(
    initialGrouping ?? [],
  );
  const [expanded, setExpanded] = React.useState<ExpandedState>(true);

  // Sync grouping state when initialGrouping prop changes
  React.useEffect(() => {
    if (initialGrouping) setGrouping(initialGrouping);
  }, [initialGrouping]);

  // Toolbar height is non-zero only when a toolbar render prop is supplied.
  // We use a fixed estimate so the toolbar's own height does not have to be
  // measured separately — the toolbar renders at 40 px in practice.
  const TOOLBAR_HEIGHT = toolbar ? 40 : 0;

  // Determine effective page size:
  //  1. When pagination is disabled, show all rows (large sentinel).
  //  2. When containerHeight is provided, derive page size dynamically.
  //  3. Otherwise fall back to the explicit `pageSize` prop.
  const effectivePageSize = React.useMemo(() => {
    if (!enablePagination) return Number.MAX_SAFE_INTEGER;
    if (containerHeight !== undefined && containerHeight > 0) {
      return calcDynamicPageSize(containerHeight, TOOLBAR_HEIGHT);
    }
    return pageSize;
  }, [enablePagination, containerHeight, pageSize, TOOLBAR_HEIGHT]);

  const allColumns = React.useMemo(() => {
    if (!enableSelection) return columns;
    const selectColumn: ColumnDef<TData, unknown> = {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      enableColumnFilter: false,
    };
    return [selectColumn, ...columns];
  }, [columns, enableSelection]);

  const table = useReactTable<TData>({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting,
    enableColumnResizing,
    columnResizeMode: enableColumnResizing ? ("onChange" as const) : undefined,
    defaultColumn: {
      ...(enableColumnResizing && { minSize: 50 }),
      // Format numeric cells with the table-wide numberFormat/decimalPlaces
      // (or formatNumber's smart defaults). Columns that supply an explicit
      // `cell` renderer in their columnDef override this — TanStack uses the
      // column-level cell when present and only falls back to defaultColumn.
      cell: ({ getValue }) => {
        const v = getValue();
        if (typeof v === "number" && Number.isFinite(v)) {
          return formatNumber(v, numberFormatConfig);
        }
        return v === null || v === undefined ? null : String(v);
      },
    },
    enableGrouping,
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel:
      enableGlobalFilter || enableColumnFilters
        ? getFilteredRowModel()
        : undefined,
    getFacetedRowModel: enableColumnFilters ? getFacetedRowModel() : undefined,
    getFacetedUniqueValues: enableColumnFilters
      ? getFacetedUniqueValues()
      : undefined,
    getGroupedRowModel: enableGrouping ? getGroupedRowModel() : undefined,
    getExpandedRowModel: enableGrouping ? getExpandedRowModel() : undefined,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGroupingChange: enableGrouping ? setGrouping : undefined,
    onExpandedChange: enableGrouping ? setExpanded : undefined,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      globalFilter,
      ...(enableGrouping ? { grouping, expanded } : {}),
    },
    initialState: {
      pagination: {
        pageSize: effectivePageSize,
      },
    },
  });

  // Keep TanStack Table's page size in sync whenever effectivePageSize changes
  // (e.g. the container is resized or the user toggles pagination off/on).
  React.useEffect(() => {
    table.setPageSize(effectivePageSize);
  }, [effectivePageSize, table]);

  React.useEffect(() => {
    if (onSelectionChange) {
      const selectedRows = table
        .getFilteredSelectedRowModel()
        .rows.map((row) => row.original);
      onSelectionChange(selectedRows);
    }
  }, [rowSelection, onSelectionChange, table]);

  // Whether to render the built-in pagination bar.  The caller-supplied
  // `pagination` render prop always takes priority.
  const showBuiltInPagination =
    enablePagination && !pagination && table.getPageCount() > 1;

  return (
    <div className={cn("space-y-4", className)}>
      {enableGrouping && grouping.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => table.toggleAllRowsExpanded(false)}
            aria-label="Collapse all"
          >
            <ChevronsDownUp className="h-3 w-3" />
            Collapse all
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => table.toggleAllRowsExpanded(true)}
            aria-label="Expand all"
          >
            <ChevronDown className="h-3 w-3" />
            Expand all
          </Button>
        </div>
      )}
      {toolbar?.(table)}
      <div className="rounded-md border">
        <UITable>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <React.Fragment key={headerGroup.id}>
                <TableRow>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className="relative group/header"
                      style={
                        enableColumnResizing
                          ? { width: header.getSize() }
                          : undefined
                      }
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      {enableColumnResizing && header.column.getCanResize() && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onDoubleClick={() => header.column.resetSize()}
                          className={cn(
                            "absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none",
                            header.column.getIsResizing()
                              ? "bg-primary opacity-100"
                              : "bg-border opacity-0 group-hover/header:opacity-50 hover:opacity-100",
                          )}
                        />
                      )}
                    </TableHead>
                  ))}
                </TableRow>
                {enableColumnFilters && (
                  <TableRow data-testid="data-grid-filter-row">
                    {headerGroup.headers.map((header) => {
                      const canFilter =
                        !header.isPlaceholder && header.column.getCanFilter();
                      const columnLabel =
                        typeof header.column.columnDef.header === "string"
                          ? (header.column.columnDef.header as string)
                          : header.column.id;
                      return (
                        <TableHead
                          key={`${header.id}-filter`}
                          colSpan={header.colSpan}
                          className="py-1"
                        >
                          {canFilter && (
                            <Input
                              type="text"
                              value={
                                (header.column.getFilterValue() as
                                  | string
                                  | undefined) ?? ""
                              }
                              onChange={(e) =>
                                header.column.setFilterValue(
                                  e.target.value || undefined,
                                )
                              }
                              placeholder="Filter…"
                              aria-label={`Filter ${columnLabel}`}
                              className="h-7 text-xs"
                            />
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const isGrouped = row.getIsGrouped();
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    style={!isGrouped ? getRowStyle?.(row.original) : undefined}
                    className={
                      isGrouped ? "bg-muted/50 font-medium" : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => {
                      const isDataCell = cell.column.id !== "select";
                      const isInClickableColumns =
                        !clickableColumns?.length ||
                        clickableColumns.includes(cell.column.id);
                      const cellClickable =
                        !isGrouped &&
                        onCellClick &&
                        isDataCell &&
                        isInClickableColumns;
                      // Grouped cell: show expand toggle + group value + count
                      if (cell.getIsGrouped()) {
                        return (
                          <TableCell key={cell.id} colSpan={1}>
                            <button
                              type="button"
                              className="flex items-center gap-1 text-left"
                              onClick={() => row.toggleExpanded()}
                              aria-label="Toggle group"
                            >
                              {row.getIsExpanded() ? (
                                <ChevronDown className="h-4 w-4 shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0" />
                              )}
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                              <span className="text-muted-foreground text-xs ml-1">
                                ({row.getLeafRows().length})
                              </span>
                            </button>
                          </TableCell>
                        );
                      }

                      // Aggregated cell: show aggregated value
                      if (cell.getIsAggregated()) {
                        return (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.aggregatedCell ??
                                cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        );
                      }

                      // Placeholder cell in grouped rows
                      if (cell.getIsPlaceholder()) {
                        return <TableCell key={cell.id} />;
                      }

                      // Normal data cell
                      return (
                        <TableCell
                          key={cell.id}
                          className={
                            cellClickable ? "cursor-pointer" : undefined
                          }
                          style={getCellStyle?.(
                            row.original as TData,
                            cell.column.id,
                          )}
                          onClick={
                            cellClickable
                              ? (e) => {
                                  e.stopPropagation();
                                  onCellClick({
                                    column: cell.column.id,
                                    value: cell.getValue(),
                                  });
                                }
                              : undefined
                          }
                        >
                          {cellClickable ? (
                            <span className="inline-flex items-center rounded-md bg-primary/5 px-2 py-0.5 text-primary hover:bg-primary/15 transition-colors">
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </span>
                          ) : (
                            flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={allColumns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </UITable>
      </div>
      {pagination
        ? pagination(table)
        : showBuiltInPagination && (
            <div className="flex items-center justify-end space-x-2">
              <div className="flex-1 text-sm text-muted-foreground">
                {enableSelection &&
                  table.getFilteredSelectedRowModel().rows.length > 0 && (
                    <>
                      {table.getFilteredSelectedRowModel().rows.length} of{" "}
                      {table.getFilteredRowModel().rows.length} row(s) selected.
                    </>
                  )}
              </div>
              <div className="text-sm text-muted-foreground">
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {table.getPageCount()}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          )}
    </div>
  );
}

export { DataGrid };
