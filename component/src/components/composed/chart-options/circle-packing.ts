import { type ChartOptionDef, SHARED_SHOW_LABELS } from "./shared";

export const circlePackingOptions: ChartOptionDef[] = [
  { ...SHARED_SHOW_LABELS, description: "Show labels inside circles." },
  {
    key: "padding",
    label: "Padding",
    type: "number",
    default: 3,
    category: "Layout",
    description: "Spacing between sibling circles (px).",
  },
];
