import { type ChartOptionDef, SHARED_SHOW_LABELS } from "./shared";

export const treemapOptions: ChartOptionDef[] = [
  { ...SHARED_SHOW_LABELS, description: "Show the name of each rectangle." },
  {
    key: "showBreadcrumb",
    label: "Show Breadcrumb",
    type: "boolean",
    default: true,
    category: "Labels",
    description:
      "Show the navigation breadcrumb when drilling down into nested data.",
  },
  {
    key: "showValues",
    label: "Show Values",
    type: "boolean",
    default: false,
    category: "Labels",
    description: "Display the numeric value inside each rectangle.",
  },
  {
    key: "colorSaturation",
    label: "Color Saturation Range",
    type: "select",
    default: "medium",
    category: "Style",
    description:
      "Controls the saturation gradient used to shade child rectangles within a parent.",
    options: [
      { label: "Low", value: "low" },
      { label: "Medium", value: "medium" },
      { label: "High", value: "high" },
    ],
  },
];
