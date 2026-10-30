import { type ChartOptionDef } from "./shared";

/** A preset picker: Default, then each name as `<prefix>-<name>` (#2368). */
function swatchOption(
  key: string,
  label: string,
  defaultToken: string,
  prefix: string,
  names: string[],
): ChartOptionDef {
  return {
    key,
    label,
    type: "swatch",
    default: "default",
    category: "Appearance",
    options: [
      { value: "default", label: "Default", token: defaultToken },
      ...names.map((name) => {
        const value = name.toLowerCase();
        return { value, label: name, token: `${prefix}-${value}` };
      }),
    ],
  };
}

export const parameterSelectOptions: ChartOptionDef[] = [
  swatchOption("fieldFill", "Field fill", "--field", "--param-fill", [
    "Azure",
    "Citrine",
    "Sage",
    "Rose",
  ]),
  swatchOption("fieldBorder", "Field border", "--input", "--param-border", [
    "Azure",
    "Citrine",
    "Sage",
    "Ink",
  ]),
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
