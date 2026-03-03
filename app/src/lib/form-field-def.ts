import type { ParameterType } from "@/stores/parameter-store";

export interface FormFieldDef {
  id: string;
  label: string;
  parameterName: string; // without $param_ prefix
  parameterType: ParameterType; // all 8 types
  required?: boolean; // when false, empty value passes null to the query instead of being omitted
  seedQuery?: string; // for select/multi-select/cascading-select
  parentParameterName?: string; // for cascading-select
  rangeMin?: number; // for number-range
  rangeMax?: number;
  rangeStep?: number;
  placeholder?: string;
  searchable?: boolean;
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
