import { type ChartOptionDef } from "./shared";

export const tableOptions: ChartOptionDef[] = [
  {
    key: "enableSorting",
    label: "Enable Sorting",
    type: "boolean",
    default: true,
    category: "Features",
    description:
      "Allow clicking column headers to sort rows ascending or descending.",
  },
  {
    key: "enableSelection",
    label: "Row Selection",
    type: "boolean",
    default: false,
    category: "Features",
    description: "Allow selecting individual rows by clicking them.",
  },
  // NOTE: `enableGlobalFilter` was removed — the schema advertised a "Global
  // Search" toggle but DataGrid never rendered a search input, so toggling
  // it had no observable effect. Per-column filters cover the filtering need.
  {
    key: "enableColumnFilters",
    label: "Column Filters",
    type: "boolean",
    default: false,
    category: "Features",
    description: "Show per-column filter inputs below each column header.",
  },
  {
    key: "enableColumnResizing",
    label: "Column Resizing",
    type: "boolean",
    default: false,
    category: "Features",
    description:
      "Allow drag-to-resize column borders. Double-click to auto-fit.",
  },
  {
    key: "enablePagination",
    label: "Enable Pagination",
    type: "boolean",
    default: true,
    category: "Pagination",
    description:
      "Show Previous / Next controls to page through large result sets.",
  },
  {
    key: "pageSize",
    label: "Page Size",
    type: "number",
    default: 10,
    category: "Pagination",
    description: "Number of rows shown per page when pagination is enabled.",
  },
  {
    key: "emptyMessage",
    label: "Empty Message",
    type: "text",
    default: "No results",
    category: "Display",
    description: "Text displayed when the query returns no rows.",
  },
  {
    key: "numberFormat",
    label: "Number Format",
    type: "select",
    default: "comma",
    category: "Display",
    description:
      "Number format for all numeric cells. Percent scales a ratio: 0.12 renders as 12%.",
    options: [
      { label: "Comma (1,234.56)", value: "comma" },
      { label: "Compact (1.2K)", value: "compact" },
      { label: "Percent (0.12 → 12%)", value: "percent" },
      { label: "Plain (1234.56)", value: "plain" },
    ],
  },
  {
    key: "decimalPlaces",
    label: "Decimal Places",
    type: "number",
    default: 2,
    category: "Display",
    description:
      "Number of decimal places shown for numeric cells. Applies table-wide.",
  },
  {
    key: "enableGrouping",
    label: "Enable Row Grouping",
    type: "boolean",
    default: false,
    category: "Grouping",
    description:
      "Group rows by column values. Pick the columns in the field below.",
  },
  {
    key: "groupBy",
    label: "Group By Columns",
    type: "column-multi-select",
    default: [],
    category: "Grouping",
    description: "Columns to group by. Order determines the nesting hierarchy.",
  },
  {
    key: "aggregationFn",
    label: "Aggregation Function",
    type: "select",
    default: "sum",
    category: "Grouping",
    description: "Aggregation function for numeric columns in grouped rows.",
    options: [
      { label: "Sum", value: "sum" },
      { label: "Average", value: "mean" },
      { label: "Median", value: "median" },
      { label: "Count", value: "count" },
      { label: "Min", value: "min" },
      { label: "Max", value: "max" },
    ],
  },
];
