import { type ChartOptionDef, SHARED_SHOW_LABELS } from "./shared";

export const sunburstOptions: ChartOptionDef[] = [
  { ...SHARED_SHOW_LABELS, description: "Show the name of each segment." },
  {
    key: "sort",
    label: "Sort Segments",
    type: "select",
    default: "desc",
    category: "Layout",
    description: "Order in which segments are arranged around the chart.",
    options: [
      { label: "Largest First", value: "desc" },
      { label: "Smallest First", value: "asc" },
      { label: "Natural (data order)", value: "none" },
    ],
  },
  {
    key: "highlightOnHover",
    label: "Highlight on Hover",
    type: "boolean",
    default: true,
    category: "Style",
    description: "Enlarge and emphasise a segment when hovered.",
  },
];
