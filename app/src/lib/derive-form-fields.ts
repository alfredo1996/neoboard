import type { FormFieldDef } from "@neoboard/components";

export interface FormFieldConfig {
  label?: string;
  type?: "text" | "number" | "date";
}

/**
 * Extract $param_xxx tokens from a query string and derive form field definitions.
 */
export function deriveFormFields(
  query: string,
  fieldConfig?: Record<string, FormFieldConfig>,
): FormFieldDef[] {
  if (!query) return [];

  const tokenRegex = /\$param_(\w+)/g;
  const seen = new Set<string>();
  const fields: FormFieldDef[] = [];

  let match;
  while ((match = tokenRegex.exec(query)) !== null) {
    const fullName = `param_${match[1]}`;
    if (seen.has(fullName)) continue;
    seen.add(fullName);

    const config = fieldConfig?.[fullName];
    fields.push({
      name: fullName,
      label: config?.label ?? match[1],
      type: config?.type ?? "text",
    });
  }

  return fields;
}
