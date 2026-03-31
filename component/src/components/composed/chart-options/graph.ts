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
    key: "nodeSize",
    label: "Node Size",
    type: "select",
    default: "medium",
    category: "Layout",
    description: "Visual size of each node circle.",
    options: [
      { label: "Small", value: "small" },
      { label: "Medium", value: "medium" },
      { label: "Large", value: "large" },
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
  {
    key: "physics",
    label: "Enable Physics",
    type: "boolean",
    default: true,
    category: "Style",
    description:
      "Enable physics simulation so nodes repel and edges act as springs.",
  },
];
