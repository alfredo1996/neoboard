import { type ChartOptionDef, SHARED_SHOW_LABELS } from "./shared";

export const graphOptions: ChartOptionDef[] = [
  {
    key: "layout",
    label: "Layout",
    type: "select",
    default: "force",
    category: "Layout",
    description:
      "Algorithm used to position nodes: force simulation, circular ring, or hierarchical tree.",
    options: [
      { label: "Force", value: "force" },
      { label: "Circular", value: "circular" },
      { label: "Hierarchical", value: "hierarchical" },
    ],
  },
  {
    ...SHARED_SHOW_LABELS,
    description: "Show the node label (first string property) on each node.",
  },
  {
    key: "showRelationshipLabels",
    label: "Show Relationship Labels",
    type: "boolean",
    default: false,
    category: "Labels",
    description:
      "Draw the relationship type on each edge. Off by default: the type shows on hover.",
  },
];
