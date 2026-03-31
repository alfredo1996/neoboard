import { type ChartOptionDef } from "./shared";

export const parameterSelectOptions: ChartOptionDef[] = [
  {
    key: "placeholder",
    label: "Placeholder",
    type: "text",
    default: "",
    category: "Parameter",
    description:
      "Hint text shown inside the selector when no value has been chosen.",
  },
  {
    key: "searchable",
    label: "Search-as-you-type",
    type: "boolean",
    default: true,
    category: "Parameter",
    description:
      "Allow the user to type to filter the option list in real time.",
  },
  {
    key: "defaultValue",
    label: "Default Value",
    type: "text",
    default: "",
    category: "Parameter",
    description:
      "Value used on dashboard load when no selection has been made. Leave empty for no default.",
  },
  {
    key: "syncToUrl",
    label: "Sync to URL",
    type: "boolean",
    default: false,
    category: "Parameter",
    description:
      "Persist the selected value as a URL search parameter so it survives page reloads and can be shared via link.",
  },
];
