import {
  type ChartOptionDef,
  SHARED_SHOW_LEGEND,
  SHARED_X_AXIS_LABEL,
  SHARED_Y_AXIS_LABEL,
  SHARED_SHOW_GRID_LINES,
  SHARED_REFERENCE_LINES,
} from "./shared";

export const barOptions: ChartOptionDef[] = [
  {
    key: "orientation",
    label: "Orientation",
    type: "select",
    default: "vertical",
    category: "Layout",
    description:
      "Vertical bars grow upward; horizontal bars grow left-to-right.",
    options: [
      { label: "Vertical", value: "vertical" },
      { label: "Horizontal", value: "horizontal" },
    ],
  },
  {
    key: "stackMode",
    label: "Stack Mode",
    type: "select",
    default: "none",
    category: "Layout",
    description:
      "How to arrange multiple series: side by side, stacked, or 100% stacked (percentage).",
    options: [
      { label: "Normal (grouped)", value: "none" },
      { label: "Stacked", value: "stacked" },
      { label: "100% Stacked", value: "percent" },
    ],
  },
  {
    key: "barWidth",
    label: "Bar Width (px, 0=auto)",
    type: "number",
    default: 0,
    category: "Layout",
    description:
      "Width of each bar in pixels. Set to 0 to let the chart auto-size.",
  },
  {
    key: "barGap",
    label: "Bar Gap",
    type: "text",
    default: "30%",
    category: "Layout",
    description:
      "Gap between bar groups as a percentage of the bar width (e.g. '30%').",
  },
  {
    key: "showValues",
    label: "Show Values",
    type: "boolean",
    default: false,
    category: "Labels",
    description: "Display the numeric value as a label on each bar.",
  },
  SHARED_SHOW_LEGEND,
  SHARED_X_AXIS_LABEL,
  SHARED_Y_AXIS_LABEL,
  SHARED_SHOW_GRID_LINES,
  {
    key: "axisLabelRotation",
    label: "Axis Label Rotation (°)",
    type: "number",
    default: -1,
    category: "Labels",
    description:
      "Override axis label rotation angle (0-90). Set to -1 for automatic (rotates at 8+ categories).",
  },
  SHARED_REFERENCE_LINES,
];
