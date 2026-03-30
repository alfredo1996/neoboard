import { type ChartOptionDef, SHARED_SHOW_LEGEND } from "./shared";

export const pieOptions: ChartOptionDef[] = [
  {
    key: "donut",
    label: "Donut Style",
    type: "boolean",
    default: false,
    category: "Style",
    description:
      "Cut a circular hole in the centre to render the chart as a donut.",
  },
  {
    key: "roseMode",
    label: "Rose/Nightingale Mode",
    type: "boolean",
    default: false,
    category: "Style",
    description:
      "Vary each slice's radius by its value (Nightingale / rose chart).",
  },
  {
    key: "labelPosition",
    label: "Label Position",
    type: "select",
    default: "outside",
    category: "Labels",
    description: "Where to place the slice labels relative to the chart.",
    options: [
      { label: "Outside", value: "outside" },
      { label: "Inside", value: "inside" },
      { label: "Center", value: "center" },
    ],
  },
  {
    key: "showLabel",
    label: "Show Labels",
    type: "boolean",
    default: true,
    category: "Labels",
    description: "Show the category name on each slice.",
  },
  {
    key: "showPercentage",
    label: "Show Percentage",
    type: "boolean",
    default: true,
    category: "Labels",
    description: "Show the percentage value on each slice.",
  },
  {
    ...SHARED_SHOW_LEGEND,
    description: "Show the chart legend identifying each slice.",
  },
  {
    key: "sortSlices",
    label: "Sort Slices by Value",
    type: "boolean",
    default: false,
    category: "Layout",
    description:
      "Sort slices by value (largest first) for a cleaner visual layout.",
  },
  {
    key: "topN",
    label: "Top N Slices",
    type: "number",
    default: 0,
    category: "Layout",
    description:
      "Show only the top N slices and group the rest into 'Other'. Set to 0 to show all.",
  },
  {
    key: "donutCenterText",
    label: "Donut Center Text",
    type: "text",
    default: "",
    category: "Labels",
    description:
      "Custom text in the donut center. Leave blank to show the total.",
  },
];
