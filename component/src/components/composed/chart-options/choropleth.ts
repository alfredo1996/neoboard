import { type ChartOptionDef, SHARED_SHOW_LABELS } from "./shared";

export const choroplethOptions: ChartOptionDef[] = [
  {
    ...SHARED_SHOW_LABELS,
    default: false,
    description: "Show country name labels on the map.",
  },
  {
    key: "showVisualMap",
    label: "Show Legend",
    type: "boolean",
    default: true,
    category: "Style",
    description: "Show the color range legend.",
  },
  {
    key: "roam",
    label: "Enable Zoom & Pan",
    type: "boolean",
    default: true,
    category: "Style",
    description: "Allow zooming and panning the map.",
  },
  {
    key: "minColor",
    label: "Min Color",
    type: "text",
    default: "#fff7d6",
    category: "Style",
    description: "Color for the lowest value.",
  },
  {
    key: "maxColor",
    label: "Max Color",
    type: "text",
    default: "#993404",
    category: "Style",
    description: "Color for the highest value.",
  },
];
