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
    default: true,
    category: "Labels",
    description: "Show the relationship type name on each edge.",
  },
];
