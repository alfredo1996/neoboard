import { type ChartOptionDef } from "./shared";

export const singleValueOptions: ChartOptionDef[] = [
  {
    key: "title",
    label: "Title",
    type: "text",
    default: "",
    category: "Value",
    help: "Leave blank to hide.",
    description: "Custom heading shown above the value. Leave blank to hide.",
  },
  {
    key: "prefix",
    label: "Prefix",
    type: "text",
    default: "",
    category: "Value",
    description: "Text prepended to the value (e.g. '$', '€').",
  },
  {
    key: "suffix",
    label: "Suffix",
    type: "text",
    default: "",
    category: "Value",
    description: "Text appended to the value (e.g. '%', ' items').",
  },
  {
    key: "decimalPlaces",
    label: "Decimal Places",
    type: "number",
    default: -1,
    category: "Value",
    auto: -1,
    help: "0 to 6.",
    description:
      "Fixed number of decimal places (0-6). Leave empty for automatic.",
  },
  {
    key: "fontSize",
    label: "Font Size",
    type: "select",
    default: "lg",
    category: "Value",
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
    category: "Value",
    description:
      "Number format for the value. Percent scales a ratio: query 0.42 to render 42%.",
    options: [
      { label: "Plain", value: "plain" },
      { label: "Comma", value: "comma" },
      { label: "Compact", value: "compact" },
      { label: "Percent (0.42 → 42%)", value: "percent" },
    ],
  },
  {
    key: "trendEnabled",
    label: "Show Trend Indicator",
    type: "boolean",
    default: false,
    category: "Value",
    help: "Needs 2 rows.",
    description:
      "Trend arrow comparing the current value to the previous period. Needs 2 rows.",
  },
];
