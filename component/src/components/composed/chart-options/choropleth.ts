import {
  CHOROPLETH_DEFAULT_MIN_COLOR,
  CHOROPLETH_DEFAULT_MAX_COLOR,
} from "@/charts/choropleth-ramp";
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
    category: "Layout",
    description: "Show the color range legend.",
  },
  {
    key: "roam",
    label: "Enable Zoom & Pan",
    type: "boolean",
    default: true,
    category: "Layout",
    description: "Allow zooming and panning the map.",
  },
  {
    key: "minColor",
    label: "Min Color",
    type: "text",
    default: CHOROPLETH_DEFAULT_MIN_COLOR,
    category: "Color",
    help: "Dark mode inverts its lightness.",
    description: "Color for the lowest value. Dark mode inverts its lightness.",
  },
  {
    key: "maxColor",
    label: "Max Color",
    type: "text",
    default: CHOROPLETH_DEFAULT_MAX_COLOR,
    category: "Color",
    help: "Dark mode inverts its lightness.",
    description:
      "Color for the highest value. Dark mode inverts its lightness.",
  },
];
