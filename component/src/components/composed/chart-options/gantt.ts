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
  {
    // Not the shared dataZoomOptions entry: that one is off by default and
    // describes scroll-only zoom, while the gantt has always drawn its slider
    // and must keep doing so for dashboards saved before the key existed.
    key: "enableDataZoom",
    label: "Enable Time Zoom",
    type: "boolean",
    default: true,
    category: "Interaction",
    description:
      "Show the range slider under the chart and allow scroll-to-zoom on the time axis.",
  },
];
