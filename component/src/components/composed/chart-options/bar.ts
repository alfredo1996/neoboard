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
    category: "Bars",
    description:
      "Vertical bars grow upward; horizontal bars grow left-to-right.",
    options: [
      { label: "Vertical", value: "vertical" },
      { label: "Horizontal", value: "horizontal" },
    ],
  },
  {
    key: "stackMode",
    label: "Stacking",
    type: "select",
    default: "none",
    category: "Bars",
    description:
      "How to arrange multiple series: side by side, stacked, or 100% stacked (percentage).",
    options: [
      { label: "Grouped", value: "none" },
      { label: "Stacked", value: "stacked" },
      { label: "100%", value: "percent" },
    ],
  },
  {
    key: "barWidth",
    label: "Bar Width",
    type: "number",
    default: 0,
    category: "Bars",
    unit: "px",
    auto: 0,
    description:
      "Width of each bar in pixels. Leave empty to let the chart auto-size.",
  },
  {
    key: "barGap",
    label: "Bar Gap",
    type: "text",
    default: "30%",
    category: "Bars",
    unit: "%",
    percent: true,
    description:
      "Gap between bar groups as a percentage of the bar width (e.g. '30%').",
  },
  {
    key: "showValues",
    label: "Show Values",
    type: "boolean",
    default: false,
    category: "Data labels",
    description: "Display the numeric value as a label on each bar.",
  },
  SHARED_SHOW_LEGEND,
  SHARED_X_AXIS_LABEL,
  SHARED_Y_AXIS_LABEL,
  SHARED_SHOW_GRID_LINES,
  {
    key: "axisLabelRotation",
    label: "Label Rotation",
    type: "number",
    default: -1,
    category: "Axes",
    unit: "°",
    auto: -1,
    help: "0 to 90. Auto keeps labels flat and cuts them to fit.",
    description:
      "Axis label rotation, 0-90. Empty keeps labels flat and cuts them to fit (#2226).",
  },
  SHARED_REFERENCE_LINES,
];
