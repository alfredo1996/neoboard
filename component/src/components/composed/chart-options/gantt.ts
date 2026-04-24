import { type ChartOptionDef } from "./shared";

export const ganttOptions: ChartOptionDef[] = [
  {
    key: "showTodayLine",
    label: "Show Today Line",
    type: "boolean",
    default: true,
    category: "Style",
    description: "Display a vertical dashed line marking today's date.",
  },
  {
    key: "showProgress",
    label: "Show Progress",
    type: "boolean",
    default: false,
    category: "Style",
    description:
      "Overlay a progress indicator inside each bar (requires a progress column returning 0–1).",
  },
  {
    key: "showGridLines",
    label: "Show Grid Lines",
    type: "boolean",
    default: true,
    category: "Style",
    description: "Show vertical grid lines on the time axis.",
  },
  {
    key: "barBorderRadius",
    label: "Bar Corner Radius",
    type: "number",
    default: 2,
    category: "Style",
    description: "Corner radius for task bars (0 = square, 4+ = rounded).",
  },
];
