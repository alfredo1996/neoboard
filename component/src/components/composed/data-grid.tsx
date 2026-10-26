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
  CellContext,
  FilterFn,
  Column,
  ColumnDef,
  Header,
  HeaderContext,
  SortingState,
  VisibilityState,
  RowSelectionState,
  ColumnFiltersState,
  GroupingState,
  ExpandedState,
  Table,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Inbox,
  Search,
} from "lucide-react";
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
import { DataGridColumnHeader } from "./data-grid-column-header";
import {
  formatNumber,
  type NumberFormat,
  type NumberFormatConfig,
} from "@/charts/chart-utils";
import { isNumericCell } from "@/lib/numeric-cell";
import {
  inferColumnKind,
  sortDescFirstForKind,
  sortingFnForKind,
} from "@/lib/column-kinds";

export type DataGridColumn<TData> = ColumnDef<TData, unknown>;

/** Keyboard resize step, in px, for the column resize handle (#1283). */
const RESIZE_STEP_PX = 16;

/**
 * Fixed layout heights used when computing the dynamic page size from a
 * known container height.  Keep in sync with the actual rendered heights.
 */
export const DATA_GRID_HEADER_HEIGHT = 34.5; // px — table <thead> row, measured (#2257)
export const DATA_GRID_ROW_HEIGHT = 36; // px — single data <tr>
export const DATA_GRID_PAGINATION_HEIGHT = 38; // px — footer: 10px gap + 28px buttons

/** px — the search box (32px field + 8px gap) above the table. */
const SEARCH_BOX_HEIGHT = 40;

/** Rows per page when neither an explicit size nor a container height is available. */
export const DEFAULT_PAGE_SIZE = 10;

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

/**
 * A column's values across the whole data set, or undefined for a display
 * column with no accessor.
 */
function columnValues<TData>(
  col: ColumnDef<TData, unknown>,
  data: TData[],
): unknown[] | undefined {
  if ("accessorKey" in col && col.accessorKey !== undefined) {
    const key = String(col.accessorKey);
    return data.map((row) => (row as Record<string, unknown>)[key]);
  }
  if ("accessorFn" in col && col.accessorFn) {
    const fn = col.accessorFn;
    return data.map((row, i) => fn(row, i));
  }
  return undefined;
}

// Module scope: flexRender mounts a renderer as a component, so a new
// function per render remounted the checkboxes and dropped focus (#2106).
function SelectAllHeader<TData>({
  table,
}: Readonly<HeaderContext<TData, unknown>>) {
  return (
    <>
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
      {/* The <th> itself needs text, not just the checkbox's label (#1505). */}
      <span className="sr-only">Select</span>
    </>
  );
}

function SelectRowCell<TData>({ row }: Readonly<CellContext<TData, unknown>>) {
  return (
    <Checkbox
      checked={row.getIsSelected()}
      onCheckedChange={(value) => row.toggleSelected(!!value)}
      aria-label="Select row"
    />
  );
}

/**
 * A year or an id is a label that happens to be a number: "1,999" is wrong.
 * A rule on the column's name, the same for every connector (#2222).
 */
const WHOLE_NUMBER = /^-?\d+$/;
const LABEL_COLUMN = /^(year|id)$|_id$/i;
/** A column named `m.year` or `p.customer_id` is judged by the part after the last dot. */
const isLabelColumn = (columnId: string) =>
  LABEL_COLUMN.test(columnId.slice(columnId.lastIndexOf(".") + 1));

const MAX_AUTO_DECIMALS = 2;
const FRACTION = /\.(\d+)/;

/**
 * Automatic decimals for one numeric column: the most any of its values
 * carries, capped at 2, so the column lines up. All whole numbers: none.
 */
function autoDecimals(values: readonly unknown[]): number {
  let most = 0;
  for (const v of values) {
    if (!isNumericCell(v)) continue;
    const text = String(v);
    most = Math.max(
      most,
      /e/i.test(text)
        ? MAX_AUTO_DECIMALS
        : (FRACTION.exec(text)?.[1].length ?? 0),
    );
  }
  return Math.min(most, MAX_AUTO_DECIMALS);
}

/**
 * What the grid knows about a column, on `columnDef.meta`. A column's own
 * `cell` renderer calls `formatNumber` to print a number the way the rest of
 * the table does (separator, the widget's number format); the grid never
 * overrides a renderer a column supplies.
 */
export interface DataGridColumnMeta {
  /** Right-aligned, tabular figures: the column holds numbers. */
  numeric?: boolean;
  formatNumber?: (value: number | string) => string;
}
type GridColumnMeta = DataGridColumnMeta;

/**
 * Table cells always want comma formatting (it's tabular data). Both
 * settings unset: comma with up to 2 decimals and no trailing zeros, so an
 * integer prints bare. An author's setting wins: comma unless they chose
 * another. A year or an id prints bare under "comma" or while nothing is set.
 */
function makeNumberFormatter(
  numberFormat: NumberFormat | undefined,
  decimalPlaces: number | undefined,
  columnDecimals: ReadonlyMap<string, number>,
) {
  const unset = numberFormat === undefined && decimalPlaces === undefined;
  const config: NumberFormatConfig = unset
    ? { context: "table" }
    : {
        numberFormat: numberFormat ?? "comma",
        ...(decimalPlaces !== undefined && { decimalPlaces }),
      };
  // "comma" is what a widget saved before "Automatic" existed carries; the
  // rule holds whatever the decimals are set to.
  const bareLabels = numberFormat === undefined || numberFormat === "comma";
  return (value: number | string, columnId: string): string => {
    if (
      bareLabels &&
      WHOLE_NUMBER.test(String(value)) &&
      isLabelColumn(columnId)
    ) {
      return String(value);
    }
    const own = unset ? columnDecimals.get(columnId) : undefined;
    // A mean of whole numbers is not whole: a figure keeps its own decimals
    // (a raw cell never has more than its column's, so only aggregates gain).
    const decimals =
      own === undefined ? undefined : Math.max(own, autoDecimals([value]));
    return decimals === undefined
      ? formatNumber(value, config)
      : formatNumber(value, { numberFormat: "comma", decimalPlaces: decimals });
  };
}

function columnId<TData>(col: ColumnDef<TData, unknown>): string {
  if (col.id !== undefined) return col.id;
  return "accessorKey" in col ? String(col.accessorKey) : "";
}

function isNumericColumn(values: readonly unknown[], kind: string): boolean {
  // A column of numeric-looking strings (zip codes, "007") is text.
  return kind === "numeric" && values.some((v) => typeof v === "number");
}

/** None on a column that cannot sort: "none" announces it as sortable (#1285). */
function ariaSort<TData>(
  column: Column<TData, unknown>,
): React.AriaAttributes["aria-sort"] {
  if (!column.getCanSort()) return undefined;
  const sorted = column.getIsSorted();
  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return "none";
}

/** Each optional feature's row models, left out while it is off. */
function optionalRowModels<TData>(on: { sorting: boolean; grouping: boolean }) {
  return {
    getSortedRowModel: on.sorting ? getSortedRowModel<TData>() : undefined,
    // Filtering is always on: every column's header menu has a filter field.
    getFilteredRowModel: getFilteredRowModel<TData>(),
    getFacetedRowModel: getFacetedRowModel<TData>(),
    getFacetedUniqueValues: getFacetedUniqueValues<TData>(),
    getGroupedRowModel: on.grouping ? getGroupedRowModel<TData>() : undefined,
    getExpandedRowModel: on.grouping ? getExpandedRowModel<TData>() : undefined,
  };
}

export interface DataGridProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  enableSorting?: boolean;
  enableSelection?: boolean;
  /** A search box above the table, matching every visible column (#2222). */
  enableGlobalFilter?: boolean;
  /**
   * Whether to show pagination controls.  Defaults to `true`.
   * When `false` all rows are rendered on a single page.
   */
  /** Allow drag-to-resize column borders. */
  enableColumnResizing?: boolean;
  enablePagination?: boolean;
  /**
   * Explicit rows per page. When set (and > 0) it takes precedence over
   * `containerHeight` — an author who configured a page size meant it (#1530).
   * Leave undefined to let the grid fit rows to its container.
   */
  pageSize?: number;
  /**
   * Height of the outer widget container in pixels.  When provided,
   * `enablePagination` is `true` and no explicit `pageSize` is set, the page
   * size is calculated dynamically so that exactly as many rows as fit are
   * shown — no overflow, no wasted space (#16).
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
  /** Message shown in the empty state (no rows / filtered to none). */
  emptyMessage?: string;
  className?: string;
  /**
   * Table-wide number format applied to every numeric cell that does not
   * have a custom `cell` renderer in its column definition. #910/#911.
   * Falls through to the formatNumber default (comma + 2dp) when omitted.
   */
  numberFormat?: NumberFormat;
  /** Table-wide decimal places for numeric cells. See `numberFormat`. */
  decimalPlaces?: number;
  /**
   * A stable id per row. Without it rows are keyed by position, so a row
   * inserted above moves focus and selection onto another record (#2123).
   */
  getRowId?: (row: TData, index: number) => string;
}

function numeric<TData>(column: Column<TData, unknown>): boolean {
  return (
    (column.columnDef.meta as GridColumnMeta | undefined)?.numeric === true
  );
}

function FooterLink({
  onClick,
  children,
}: Readonly<{ onClick: () => void; children: React.ReactNode }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm text-ring hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
    </button>
  );
}

/** A string header becomes the column's menu button (#2222). */
function renderHeader<TData>(header: Header<TData, unknown>) {
  if (header.isPlaceholder) return null;
  const def = header.column.columnDef.header;
  if (typeof def === "string" && header.column.id !== "select") {
    return (
      <DataGridColumnHeader
        column={header.column}
        title={def}
        align={numeric(header.column) ? "right" : "left"}
      />
    );
  }
  return flexRender(def, header.getContext());
}

function DataGrid<TData>({
  columns,
  data,
  enableSorting = false,
  enableSelection = false,
  enableGlobalFilter = false,
  enableColumnResizing = false,
  enablePagination = true,
  pageSize,
  containerHeight,
  onCellClick,
  clickableColumns,
  onSelectionChange,
  getRowStyle,
  getCellStyle,
  enableGrouping = false,
  initialGrouping,
  toolbar,
  emptyMessage = "No results.",
  className,
  numberFormat,
  decimalPlaces,
  getRowId,
}: Readonly<DataGridProps<TData>>) {
  // Automatic decimals are a property of the column, so they are read off all
  // of its values once, not guessed per cell.
  const columnDecimals = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const col of columns) {
      const values = columnValues(col, data);
      if (values && isNumericColumn(values, inferColumnKind(values)))
        m.set(columnId(col), autoDecimals(values));
    }
    return m;
  }, [columns, data]);
  const formatGridNumber = React.useMemo(
    () => makeNumberFormatter(numberFormat, decimalPlaces, columnDecimals),
    [numberFormat, decimalPlaces, columnDecimals],
  );
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
  const TOOLBAR_HEIGHT =
    (toolbar ? 40 : 0) + (enableGlobalFilter ? SEARCH_BOX_HEIGHT : 0);

  // Determine effective page size:
  //  1. When pagination is disabled, show all rows (large sentinel).
  //  2. An explicit `pageSize` wins — an author who set it meant it.
  //  3. Otherwise derive from the container height (#16), so an unconfigured
  //     table fits its tile.
  //  4. Last resort when neither is available.
  //
  // The height check used to come first, which made the editor's Page Size
  // control inert on every dashboard tile — a tile always supplies a height
  // (#1530). `pageSize` therefore has no default parameter: collapsing "unset"
  // into 10 here would destroy the distinction this ordering depends on.
  //
  // `> 0` rather than a bare undefined check: a cleared number input yields 0,
  // and honouring that would render an empty grid, which reads as a data
  // failure rather than a setting.
  const effectivePageSize = React.useMemo(() => {
    if (!enablePagination) return Number.MAX_SAFE_INTEGER;
    if (pageSize !== undefined && pageSize > 0) return pageSize;
    if (containerHeight !== undefined && containerHeight > 0) {
      return calcDynamicPageSize(containerHeight, TOOLBAR_HEIGHT);
    }
    return DEFAULT_PAGE_SIZE;
  }, [enablePagination, containerHeight, pageSize, TOOLBAR_HEIGHT]);

  // Which comparator a column gets is decided from ALL of its values, not
  // from the rows TanStack's `auto` happens to sample (`flatRows.slice(10)` —
  // empty for ten rows or fewer, so every column fell through to `basic`
  // and "10" sorted before "9", "Zebra" before "apple"). A column that sets
  // its own sortingFn or sortDescFirst keeps it — the caller's def is spread
  // last (#1662).
  const typedColumns = React.useMemo(
    () =>
      columns.map((col) => {
        const values = columnValues(col, data);
        if (!values) return col;
        const kind = inferColumnKind(values);
        const id = columnId(col);
        const meta: GridColumnMeta = {
          numeric: isNumericColumn(values, kind),
          formatNumber: (v) => formatGridNumber(v, id),
        };
        return {
          sortingFn: sortingFnForKind<TData>(kind),
          sortDescFirst: sortDescFirstForKind(kind),
          ...col,
          meta: { ...meta, ...(col.meta as object | undefined) },
        };
      }),
    [columns, data, formatGridNumber],
  );

  const ownFilterFns = React.useMemo(() => {
    const m = new Map<string, FilterFn<TData>>();
    for (const col of columns) {
      if (typeof col.filterFn === "function")
        m.set(columnId(col), col.filterFn);
    }
    return m;
  }, [columns]);

  const allColumns = React.useMemo(() => {
    if (!enableSelection) return typedColumns;
    const selectColumn: ColumnDef<TData, unknown> = {
      id: "select",
      header: SelectAllHeader,
      cell: SelectRowCell,
      enableSorting: false,
      enableHiding: false,
      enableColumnFilter: false,
    };
    return [selectColumn, ...typedColumns];
  }, [typedColumns, enableSelection]);

  // The filter and the search match what the cell shows: a number by its
  // formatted text too ("12,345" finds 12,345.70), anything else by its text.
  const matchesShown = React.useCallback<FilterFn<TData>>(
    (row, id, filterValue) => {
      const v = row.getValue(id);
      const needle = String(filterValue ?? "").toLowerCase();
      if (v === null || v === undefined) return false;
      const shown =
        typeof v === "object"
          ? JSON.stringify(v)
          : String(v as string | number | boolean | bigint);
      if (shown.toLowerCase().includes(needle)) return true;
      return (
        typeof v === "number" &&
        formatGridNumber(v, id).toLowerCase().includes(needle)
      );
    },
    [formatGridNumber],
  );

  const shownCell: ColumnDef<TData, unknown>["cell"] = ({
    getValue,
    column,
  }) => {
    const v = getValue();
    if (typeof v === "number" && Number.isFinite(v)) {
      return formatGridNumber(v, column.id);
    }
    // A number a double cannot hold arrives as a string (#1304).
    if (numeric(column) && isNumericCell(v)) {
      return formatGridNumber(v, column.id);
    }
    if (v === null || v === undefined) return null;
    if (typeof v === "object") return JSON.stringify(v);
    // Query cells: a primitive once null, undefined and objects are out.
    return String(v as string | number | boolean | bigint);
  };

  const table = useReactTable<TData>({
    data,
    columns: allColumns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    enableSorting,
    enableColumnResizing,
    columnResizeMode: enableColumnResizing ? ("onChange" as const) : undefined,
    defaultColumn: {
      ...(enableColumnResizing && { minSize: 50 }),
      // Every column's filter UI is one free-text <Input>, so the only filter
      // that can honour what the user typed is a case-insensitive substring.
      // TanStack's `filterFn: "auto"` instead picks from `flatRows[0]`
      // (ColumnFiltering.ts:274-296): a numeric first cell selects
      // `inNumberRange`, whose resolveFilterValue array-destructures the typed
      // string — "300" becomes min "3" / max "0", swapped to [0, 3], so the 300
      // row disappears and the 2 and 3 rows stay; a null or boolean first cell
      // selects weakEquals/equals, which never matches typed text at all
      // (#1657). A column that wants something else still passes its own
      // `filterFn` — a column-level def wins over defaultColumn.
      filterFn: matchesShown,
      // Numbers are formatted by the grid itself where a cell is drawn, so a
      // column's own `cell` renderer (the table widget's) cannot skip it.
      cell: shownCell,
      // An aggregated figure reads like the column it sums.
      aggregatedCell: shownCell,
    },
    enableGrouping,
    getPaginationRowModel: getPaginationRowModel(),
    ...optionalRowModels<TData>({
      sorting: enableSorting,
      grouping: enableGrouping,
    }),
    // Search every visible column; without this TanStack picks the columns
    // whose first value is a string or number.
    // ponytail: the filtered rows are memoised on the filter text, so hiding
    // a column while a search is active re-evaluates on the next keystroke.
    getColumnCanGlobalFilter: (column) => column.getIsVisible(),
    // Each column's own filterFn, so a column that matches by the text it
    // shows (an object column) is not searched as "[object Object]".
    globalFilterFn: (row, id, fv, addMeta) =>
      (ownFilterFns.get(id) ?? matchesShown)(row, id, fv, addMeta),
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
      globalFilter: enableGlobalFilter ? globalFilter : "",
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

  const rowCount = table.getFilteredRowModel().rows.length;
  const totalCount = table.getCoreRowModel().rows.length;
  const isFiltered =
    columnFilters.length > 0 || (enableGlobalFilter && globalFilter !== "");
  const hiddenCount = table
    .getAllLeafColumns()
    .filter((c) => c.getCanHide() && !c.getIsVisible()).length;
  const selectedCount = enableSelection
    ? table.getFilteredSelectedRowModel().rows.length
    : 0;
  const { pageIndex, pageSize: size } = table.getState().pagination;
  // The pager pages over the pre-pagination model, which with grouping also
  // holds the group header rows; the range must count what the pages hold.
  const pagedCount = table.getPrePaginationRowModel().rows.length;
  const rangeStart = pagedCount === 0 ? 0 : pageIndex * size + 1;
  const rangeEnd = Math.min(pagedCount, (pageIndex + 1) * size);
  const showPager = enablePagination && table.getPageCount() > 1;
  const showFooter =
    enablePagination || isFiltered || hiddenCount > 0 || selectedCount > 0;
  const firstDataColumn = table
    .getVisibleLeafColumns()
    .find((c) => c.id !== "select")?.id;

  return (
    <div className={cn("flex flex-col", className)}>
      {enableGrouping && grouping.length > 0 && (
        <div className="flex items-center gap-2 pb-2">
          <Button
            variant="secondary"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => table.toggleAllRowsExpanded(false)}
            aria-label="Collapse all"
          >
            <ChevronsDownUp className="h-3 w-3" />
            Collapse all
          </Button>
          <Button
            variant="secondary"
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
      {enableGlobalFilter && (
        <div className="relative max-w-xs px-2 pb-2">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-[18px] top-[9px] h-3.5 w-3.5 text-muted-foreground"
          />
          <Input
            type="text"
            size="sm"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={`Search ${totalCount} rows`}
            aria-label="Search table"
            className="pl-8"
          />
        </div>
      )}
      {toolbar?.(table)}
      <div>
        <UITable>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <React.Fragment key={headerGroup.id}>
                <TableRow>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      aria-sort={ariaSort(header.column)}
                      className={cn(
                        "relative group/header",
                        // The header button carries its own padding.
                        typeof header.column.columnDef.header === "string" &&
                          "px-0",
                        (
                          header.column.columnDef.meta as
                            GridColumnMeta | undefined
                        )?.numeric && "text-right",
                      )}
                      style={
                        enableColumnResizing
                          ? { width: header.getSize() }
                          : undefined
                      }
                    >
                      {renderHeader(header)}
                      {enableColumnResizing && header.column.getCanResize() && (
                        // #1283 item 3: this was a bare <div> with pointer
                        // handlers only — no role, no tab stop, no keyboard
                        // path to widen a truncated column, and resetSize()
                        // reachable only by double-click.
                        <button
                          type="button"
                          aria-label={`Resize ${
                            typeof header.column.columnDef.header === "string"
                              ? header.column.columnDef.header
                              : header.column.id
                          }`}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onDoubleClick={() => header.column.resetSize()}
                          onKeyDown={(e) => {
                            if (
                              e.key === "ArrowLeft" ||
                              e.key === "ArrowRight"
                            ) {
                              e.preventDefault();
                              const delta =
                                e.key === "ArrowLeft"
                                  ? -RESIZE_STEP_PX
                                  : RESIZE_STEP_PX;
                              const min = header.column.columnDef.minSize ?? 50;
                              const next = Math.max(
                                min,
                                header.column.getSize() + delta,
                              );
                              table.setColumnSizing((prev) => ({
                                ...prev,
                                [header.column.id]: next,
                              }));
                            } else if (e.key === "Home" || e.key === "Escape") {
                              e.preventDefault();
                              header.column.resetSize();
                            }
                          }}
                          className={cn(
                            "absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none",
                            // Focus counterpart to the hover reveal — without
                            // it a keyboard user cannot see where they are.
                            "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            header.column.getIsResizing()
                              ? "bg-primary opacity-100"
                              : "bg-border opacity-0 group-hover/header:opacity-50 hover:opacity-100",
                          )}
                        />
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </React.Fragment>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const isGrouped = row.getIsGrouped();
                const rowStyle = !isGrouped
                  ? getRowStyle?.(row.original)
                  : undefined;
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    style={rowStyle}
                    className={cn(
                      isGrouped
                        ? "bg-muted/50 font-medium"
                        : // Hover affordance on data rows (#1055).
                          "transition-colors hover:bg-muted",
                    )}
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
                              className="flex items-center gap-1 text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
                          <TableCell
                            key={cell.id}
                            className={cn(
                              numeric(cell.column) && "text-right tabular-nums",
                            )}
                          >
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
                          className={cn(
                            // The first column and the figures read in ink,
                            // the other text one step down (#2222).
                            // A colour the row sets (a rule, a threshold)
                            // is the row's to give.
                            !rowStyle?.color &&
                              (cell.column.id === firstDataColumn ||
                              numeric(cell.column)
                                ? "text-foreground"
                                : "text-foreground-2"),
                            // Tabular figures keep digit columns aligned (#830)
                            (numeric(cell.column) ||
                              typeof cell.getValue() === "number") &&
                              "tabular-nums",
                            numeric(cell.column) && "text-right",
                            // Clickable cells: drop padding so the inner
                            // button fills the whole cell, preserving the
                            // full-cell click target (#980).
                            cellClickable && "p-0",
                          )}
                          style={getCellStyle?.(
                            row.original as TData,
                            cell.column.id,
                          )}
                        >
                          {cellClickable ? (
                            // Real <button> so the click action is keyboard-
                            // reachable and announced to assistive tech (#980).
                            // w-full + cell padding makes it fill the cell, so
                            // a click anywhere in the cell still activates it.
                            // stopPropagation keeps the row handler from also
                            // firing.
                            <button
                              type="button"
                              className="flex h-full w-full items-center rounded-md bg-primary/5 px-4 py-2 text-left text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                              onClick={(e) => {
                                e.stopPropagation();
                                onCellClick({
                                  column: cell.column.id,
                                  value: cell.getValue(),
                                });
                              }}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </button>
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
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={allColumns.length} className="h-32">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" aria-hidden />
                    <span className="text-sm">{emptyMessage}</span>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </UITable>
      </div>
      {showFooter && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 pt-2.5 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-1.5">
            {enablePagination && (
              <span>
                {isFiltered
                  ? `${rangeStart}–${rangeEnd} of ${pagedCount}, filtered from ${totalCount}`
                  : `${rangeStart}–${rangeEnd} of ${pagedCount}`}
              </span>
            )}
            {selectedCount > 0 && (
              <span>
                {selectedCount} of {rowCount} row(s) selected.
              </span>
            )}
            {isFiltered && (
              <>
                {enablePagination || selectedCount > 0 ? (
                  <span aria-hidden>·</span>
                ) : null}
                <FooterLink
                  onClick={() => {
                    table.resetColumnFilters();
                    setGlobalFilter("");
                  }}
                >
                  Clear filters
                </FooterLink>
              </>
            )}
            {hiddenCount > 0 && (
              <>
                {enablePagination || selectedCount > 0 || isFiltered ? (
                  <span aria-hidden>·</span>
                ) : null}
                <span>
                  {hiddenCount} {hiddenCount === 1 ? "column" : "columns"}{" "}
                  hidden
                </span>
                <span aria-hidden>·</span>
                <FooterLink onClick={() => table.resetColumnVisibility()}>
                  Show all
                </FooterLink>
              </>
            )}
          </div>
          {showPager && (
            <div className="flex gap-1.5">
              <Button
                variant="secondary"
                className="h-7 px-2.5 text-xs"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                className="h-7 px-2.5 text-xs"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { DataGrid };
