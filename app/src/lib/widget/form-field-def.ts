import type { ParameterType } from "@/stores/parameter-store";

/**
 * Optional type-based validation applied to a field's value on blur.
 * Independent from `parameterType` (the widget shape) so a free-form `text`
 * input can still validate as a number, email, or date.
 */
export type FormFieldValidationType = "text" | "number" | "email" | "date";

export interface FormFieldDef {
  id: string;
  label: string;
  parameterName: string; // without $param_ prefix
  parameterType: ParameterType; // all 8 types
  required?: boolean; // when false, empty value passes null to the query instead of being omitted
  validationType?: FormFieldValidationType; // blur-time value validation
  seedQuery?: string; // for select/multi-select/cascading-select
  staticOptions?: string; // for select: comma-separated static options (e.g. "low,medium,high")
  parentParameterName?: string; // for cascading-select
  rangeMin?: number; // for number-range
  rangeMax?: number;
  rangeStep?: number;
  placeholder?: string;
  searchable?: boolean;
  /** Step index for multi-step wizard forms. Omit for single-page mode. */
  step?: number;
}

/** Build the params object to send to the write-query API. */
export function buildFormParams(
  fields: FormFieldDef[],
  localValues: Record<string, unknown>,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const field of fields) {
    const v = localValues[field.parameterName];
    if (v === undefined || v === null || v === "") {
      if (!field.required) {
        // Optional field: pass null so the query runs with null for this param
        if (field.parameterType === "date-range") {
          params[`param_${field.parameterName}_from`] = null;
          params[`param_${field.parameterName}_to`] = null;
        } else if (field.parameterType === "number-range") {
          params[`param_${field.parameterName}_min`] = null;
          params[`param_${field.parameterName}_max`] = null;
        } else {
          params[`param_${field.parameterName}`] = null;
        }
      }
      continue;
    }
    if (
      field.parameterType === "date-range" &&
      typeof v === "object" &&
      v !== null
    ) {
      const r = v as { from?: string; to?: string };
      if (!r.from && !r.to) {
        // Empty date-range object — treat same as null
        if (!field.required) {
          params[`param_${field.parameterName}_from`] = null;
          params[`param_${field.parameterName}_to`] = null;
        }
      } else {
        if (r.from) params[`param_${field.parameterName}_from`] = r.from;
        if (r.to) params[`param_${field.parameterName}_to`] = r.to;
      }
    } else if (field.parameterType === "number-range" && Array.isArray(v)) {
      params[`param_${field.parameterName}_min`] = v[0];
      params[`param_${field.parameterName}_max`] = v[1];
    } else {
      params[`param_${field.parameterName}`] = v;
    }
  }
  return params;
}

/** Returns true if any field has a `step` assigned (wizard mode). */
export function isWizardForm(fields: FormFieldDef[]): boolean {
  return fields.some((f) => f.step !== undefined);
}

/**
 * Group fields by their step number, returning an array of arrays.
 * Normalizes gaps in step numbers (e.g. steps 0, 2, 5 become indices 0, 1, 2).
 * Fields without a step are placed in step 0.
 */
export function groupFieldsByStep(fields: FormFieldDef[]): FormFieldDef[][] {
  if (!isWizardForm(fields)) {
    return [fields];
  }

  // Collect unique step numbers and sort them
  const stepSet = new Set<number>();
  for (const f of fields) {
    stepSet.add(f.step ?? 0);
  }
  const sortedSteps = [...stepSet].sort((a, b) => a - b);

  // Build groups in normalized order
  return sortedSteps.map((stepNum) =>
    fields.filter((f) => (f.step ?? 0) === stepNum),
  );
}
