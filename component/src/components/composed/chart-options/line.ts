import {
  type ChartOptionDef,
  SHARED_SHOW_GRID_LINES,
  SHARED_X_AXIS_LABEL,
  SHARED_Y_AXIS_LABEL,
  SHARED_SHOW_LEGEND,
  SHARED_REFERENCE_LINES,
} from "./shared";

export const lineOptions: ChartOptionDef[] = [
  {
    key: "smooth",
    label: "Smooth Curve",
    type: "boolean",
    default: false,
    category: "Style",
    description:
      "Render lines as smooth Bézier curves instead of straight segments.",
  },
  {
    key: "area",
    label: "Fill Area",
    type: "boolean",
    default: false,
    category: "Style",
    description:
      "Fill the area beneath the line to emphasise volume over time.",
  },
  {
    key: "lineWidth",
    label: "Line Width (px)",
    type: "number",
    default: 2,
    category: "Style",
    description: "Stroke width of the line in pixels.",
  },
  {
    key: "stepped",
    label: "Stepped Line",
    type: "boolean",
    default: false,
    category: "Style",
    description:
      "Draw the line as a step function — useful for discrete state changes.",
  },
  {
    key: "showPoints",
    label: "Show Data Points",
    type: "boolean",
    default: false,
    category: "Style",
    description: "Draw a dot at each data point along the line.",
  },
  {
    key: "connectNulls",
    label: "Connect Nulls",
    type: "boolean",
    default: false,
    category: "Style",
    description:
      "Draw a continuous line through missing (null) data points instead of breaking the line.",
  },
  {
    key: "endLabel",
    label: "Show End Labels",
    type: "boolean",
    default: false,
    category: "Style",
    description: "Show the series name as a label at the end of each line.",
  },
  SHARED_SHOW_GRID_LINES,
  SHARED_X_AXIS_LABEL,
  SHARED_Y_AXIS_LABEL,
  SHARED_SHOW_LEGEND,
  SHARED_REFERENCE_LINES,
  {
    key: "samplingThreshold",
    label: "Sampling Threshold",
    type: "number",
    default: 1000,
    category: "Performance",
    description:
      "Enable LTTB downsampling when data points exceed this count. Set to 0 to disable.",
  },
  {
    key: "samplingMethod",
    label: "Sampling Method",
    type: "select",
    default: "lttb",
    options: [
      { label: "LTTB", value: "lttb" },
      { label: "Average", value: "average" },
      { label: "Max", value: "max" },
      { label: "Min", value: "min" },
    ],
    category: "Performance",
    description: "Algorithm for downsampling large datasets.",
  },
];
