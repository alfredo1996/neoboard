import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  useReactTable,
} from "@tanstack/react-table";
import type {
  ColumnDef,
  SortingState,
  VisibilityState,
  RowSelectionState,
  ColumnFiltersState,
  Table,
} from "@tanstack/react-table";
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type DataGridColumn<TData> = ColumnDef<TData, unknown>;

/**
 * Fixed layout heights used when computing the dynamic page size from a
 * known container height.  Keep in sync with the actual rendered heights.
 */
export const DATA_GRID_HEADER_HEIGHT = 40;   // px — table <thead> row
export const DATA_GRID_ROW_HEIGHT = 36;       // px — single data <tr>
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
    containerHeight - toolbarHeight - DATA_GRID_HEADER_HEIGHT - DATA_GRID_PAGINATION_HEIGHT;
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
  onRowClick?: (row: TData) => void;
  onSelectionChange?: (selectedRows: TData[]) => void;
  toolbar?: (table: Table<TData>) => React.ReactNode;
  pagination?: (table: Table<TData>) => React.ReactNode;
  className?: string;
}

function DataGrid<TData>({
  columns,
  data,
  enableSorting = false,
  enableSelection = false,
  enableGlobalFilter = false,
  enableColumnFilters = false,
  enablePagination = true,
  pageSize = 10,
  containerHeight,
  onRowClick,
  onSelectionChange,
  toolbar,
  pagination,
  className,
}: DataGridProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");

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
    };
    return [selectColumn, ...columns];
  }, [columns, enableSelection]);

  const table = useReactTable<TData>({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting,
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: (enableGlobalFilter || enableColumnFilters) ? getFilteredRowModel() : undefined,
    getFacetedRowModel: enableColumnFilters ? getFacetedRowModel() : undefined,
    getFacetedUniqueValues: enableColumnFilters ? getFacetedUniqueValues() : undefined,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      globalFilter,
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
  const showBuiltInPagination = enablePagination && !pagination && table.getPageCount() > 1;

  return (
    <div className={cn("space-y-4", className)}>
      {toolbar?.(table)}
      <div className="rounded-md border">
        <UITable>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={onRowClick ? "cursor-pointer" : undefined}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={allColumns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </UITable>
      </div>
      {pagination ? (
        pagination(table)
      ) : (
        showBuiltInPagination && (
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
            <button
              className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background h-8 px-3 hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </button>
            <button
              className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background h-8 px-3 hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </button>
          </div>
        )
      )}
    </div>
  );
}

export { DataGrid };
