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
  {
    key: "fontSize",
    label: "Font Size",
    type: "select",
    default: "sm",
    category: "Display",
    description: "Font size used for the JSON syntax highlighting.",
    options: [
      { label: "Small", value: "sm" },
      { label: "Medium", value: "md" },
      { label: "Large", value: "lg" },
    ],
  },
  {
    key: "showCopyButton",
    label: "Show Copy Button",
    type: "boolean",
    default: true,
    category: "Display",
    description:
      "Show a button to copy the full JSON payload to the clipboard.",
  },
  {
    key: "theme",
    label: "Theme",
    type: "select",
    default: "dark",
    category: "Display",
    description: "Colour theme for the JSON syntax highlighting.",
    options: [
      { label: "Dark", value: "dark" },
      { label: "Light", value: "light" },
    ],
  },
];
