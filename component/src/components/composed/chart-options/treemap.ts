import { type ChartOptionDef, SHARED_SHOW_LABELS } from "./shared";

export const treemapOptions: ChartOptionDef[] = [
  { ...SHARED_SHOW_LABELS, description: "Show the name of each rectangle." },
  {
    key: "showValues",
    label: "Show Values",
    type: "boolean",
    default: false,
    category: "Labels",
    description: "Display the numeric value inside each rectangle.",
  },
];
