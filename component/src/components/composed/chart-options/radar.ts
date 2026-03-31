import { type ChartOptionDef, SHARED_SHOW_LEGEND } from "./shared";

export const radarOptions: ChartOptionDef[] = [
  {
    key: "shape",
    label: "Shape",
    type: "select",
    default: "polygon",
    category: "Style",
    description: "Outline shape of the radar grid.",
    options: [
      { label: "Polygon", value: "polygon" },
      { label: "Circle", value: "circle" },
    ],
  },
  {
    key: "filled",
    label: "Fill Area",
    type: "boolean",
    default: true,
    category: "Style",
    description: "Fill the area enclosed by the data polygon.",
  },
  {
    ...SHARED_SHOW_LEGEND,
    description: "Show the legend identifying each series.",
  },
  {
    key: "showValues",
    label: "Show Values on Points",
    type: "boolean",
    default: false,
    category: "Labels",
    description: "Display the numeric value at each data point on the radar.",
  },
];
