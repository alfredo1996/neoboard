import { type ChartOptionDef } from "./shared";

export const gaugeOptions: ChartOptionDef[] = [
  {
    key: "min",
    label: "Min Value",
    type: "number",
    default: 0,
    category: "Range",
    description: "Minimum value on the gauge scale.",
  },
  {
    key: "max",
    label: "Max Value",
    type: "number",
    default: 100,
    category: "Range",
    description: "Maximum value on the gauge scale.",
  },
  {
    key: "showProgress",
    label: "Show Progress Arc",
    type: "boolean",
    default: true,
    category: "Style",
    description: "Fill the gauge arc to show progress toward the maximum.",
  },
  {
    key: "showPointer",
    label: "Show Pointer",
    type: "boolean",
    default: true,
    category: "Style",
    description: "Display a needle pointer on the gauge.",
  },
  {
    key: "showDetail",
    label: "Show Value Detail",
    type: "boolean",
    default: true,
    category: "Labels",
    description: "Show the numeric value and name below the gauge.",
  },
  {
    key: "startAngle",
    label: "Start Angle (°)",
    type: "number",
    default: 225,
    category: "Layout",
    description: "Starting angle of the gauge arc in degrees (0 = 3 o'clock).",
  },
  {
    key: "endAngle",
    label: "End Angle (°)",
    type: "number",
    default: -45,
    category: "Layout",
    description: "Ending angle of the gauge arc in degrees.",
  },
  {
    key: "thresholdZones",
    label: "Threshold Zones (JSON)",
    type: "text",
    default: "",
    category: "Style",
    description:
      'Colored zones on the gauge arc: [{"value":30,"color":"#67e0e3"},{"value":70,"color":"#37a2da"},{"value":100,"color":"#fd666d"}]',
  },
];
