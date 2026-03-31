import { type ChartOptionDef, SHARED_SHOW_LABELS } from "./shared";

export const sankeyOptions: ChartOptionDef[] = [
  {
    key: "orient",
    label: "Orientation",
    type: "select",
    default: "horizontal",
    category: "Layout",
    description:
      "Direction of the flow: left-to-right (horizontal) or top-to-bottom (vertical).",
    options: [
      { label: "Horizontal", value: "horizontal" },
      { label: "Vertical", value: "vertical" },
    ],
  },
  {
    ...SHARED_SHOW_LABELS,
    label: "Show Node Labels",
    description: "Show the node name alongside each block.",
  },
  {
    key: "nodeWidth",
    label: "Node Width (px)",
    type: "number",
    default: 20,
    category: "Layout",
    description: "Width of each node block in pixels.",
  },
  {
    key: "nodeGap",
    label: "Node Gap (px)",
    type: "number",
    default: 8,
    category: "Layout",
    description: "Vertical gap between nodes at the same level in pixels.",
  },
];
