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
  {
    key: "enableGlobalFilter",
    label: "Search Box",
    type: "boolean",
    default: false,
    category: "Features",
    description: "A search box above the table, matching every visible column.",
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
    default: "auto",
    category: "Display",
    description:
      "Number format for all numeric cells. Percent scales a ratio: 0.12 renders as 12%.",
    options: [
      { label: "Automatic (18 · 1,234.50)", value: "auto" },
      { label: "Comma (1,234.5678, as stored)", value: "comma" },
      { label: "Compact (1.2K)", value: "compact" },
      { label: "Percent (0.12 → 12%)", value: "percent" },
      { label: "Plain (1234.56)", value: "plain" },
    ],
  },
  {
    key: "decimalPlaces",
    label: "Decimal Places",
    type: "number",
    default: -1,
    category: "Display",
    description:
      "Decimal places for numeric cells (0-6). -1 is automatic: up to 2.",
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
