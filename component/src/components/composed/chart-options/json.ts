import { type ChartOptionDef } from "./shared";

export const jsonOptions: ChartOptionDef[] = [
  {
    key: "initialExpanded",
    label: "Initial Expand Depth",
    type: "number",
    default: 2,
    category: "Display",
    description:
      "How many levels deep the JSON tree is expanded when first rendered (0 = collapsed).",
  },
];
