import { type ChartOptionDef } from "./shared";

export const parameterSelectOptions: ChartOptionDef[] = [
  {
    key: "fieldFill",
    label: "Field fill",
    type: "swatch",
    default: "default",
    category: "Appearance",
    options: [
      { value: "default", label: "Default", token: "--field" },
      { value: "azure", label: "Azure", token: "--param-fill-azure" },
      { value: "citrine", label: "Citrine", token: "--param-fill-citrine" },
      { value: "sage", label: "Sage", token: "--param-fill-sage" },
      { value: "rose", label: "Rose", token: "--param-fill-rose" },
    ],
  },
  {
    key: "fieldBorder",
    label: "Field border",
    type: "swatch",
    default: "default",
    category: "Appearance",
    options: [
      { value: "default", label: "Default", token: "--input" },
      { value: "azure", label: "Azure", token: "--param-border-azure" },
      { value: "citrine", label: "Citrine", token: "--param-border-citrine" },
      { value: "sage", label: "Sage", token: "--param-border-sage" },
      { value: "ink", label: "Ink", token: "--param-border-ink" },
    ],
  },
  {
    key: "placeholder",
    label: "Placeholder",
    type: "text",
    default: "",
    category: "Behaviour",
    description:
      "Hint text shown inside the selector when no value has been chosen.",
  },
  {
    key: "searchable",
    label: "Search-as-you-type",
    type: "boolean",
    default: true,
    category: "Behaviour",
    description:
      "Allow the user to type to filter the option list in real time.",
  },
  {
    key: "defaultValue",
    label: "Default Value",
    type: "text",
    default: "",
    category: "Behaviour",
    description:
      "Value used on dashboard load when no selection has been made. Leave empty for no default.",
  },
  {
    key: "syncToUrl",
    label: "Sync to URL",
    type: "boolean",
    default: false,
    category: "Behaviour",
    description:
      "Keep the selected value in the URL so it survives reloads and can be shared.",
  },
];
