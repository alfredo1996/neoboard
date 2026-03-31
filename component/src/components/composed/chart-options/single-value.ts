import { type ChartOptionDef } from "./shared";

export const singleValueOptions: ChartOptionDef[] = [
  {
    key: "title",
    label: "Title",
    type: "text",
    default: "",
    category: "Display",
    description: "Custom heading shown above the value. Leave blank to hide.",
  },
  {
    key: "prefix",
    label: "Prefix",
    type: "text",
    default: "",
    category: "Display",
    description: "Text prepended to the value (e.g. '$', '€').",
  },
  {
    key: "suffix",
    label: "Suffix",
    type: "text",
    default: "",
    category: "Display",
    description: "Text appended to the value (e.g. '%', ' items').",
  },
  {
    key: "decimalPlaces",
    label: "Decimal Places",
    type: "number",
    default: -1,
    category: "Display",
    description:
      "Fixed number of decimal places (0-6). Set to -1 for automatic.",
  },
  {
    key: "fontSize",
    label: "Font Size",
    type: "select",
    default: "lg",
    category: "Display",
    description: "Size of the main displayed value.",
    options: [
      { label: "Small", value: "sm" },
      { label: "Medium", value: "md" },
      { label: "Large", value: "lg" },
      { label: "Extra Large", value: "xl" },
    ],
  },
  {
    key: "numberFormat",
    label: "Number Format",
    type: "select",
    default: "plain",
    category: "Display",
    description:
      "How to format the numeric value — plain, comma-separated, compact (1.2k), or percentage.",
    options: [
      { label: "Plain", value: "plain" },
      { label: "Comma", value: "comma" },
      { label: "Compact", value: "compact" },
      { label: "Percent", value: "percent" },
    ],
  },
  {
    key: "trendEnabled",
    label: "Show Trend Indicator",
    type: "boolean",
    default: false,
    category: "Display",
    description:
      "Show a trend arrow comparing the current value to the previous period (requires 2 rows in the query result).",
  },
];
