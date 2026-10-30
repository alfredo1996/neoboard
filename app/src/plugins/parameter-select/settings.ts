/**
 * Zod settings schema for the parameter selector widget plugin.
 */
import { z } from "zod";

export const parameterSelectSettingsSchema = z
  .object({
    parameterName: z.string().optional(),
    // `cascading-select` was retired in #1360 — a cascading select is just a
    // `select` that names a `parentParameterName`. A stored widget still
    // carrying the old value fails validation, so safeParseSettings falls
    // back to defaults and the widget shows the "No parameter name" empty
    // state, prompting a re-save in the editor (which reopens it as the
    // select it always was, parent intact).
    parameterType: z
      .enum([
        "select",
        "text",
        "date",
        "date-range",
        "date-relative",
        "number-range",
        "multi-select",
      ])
      .default("select"),
    seedQuery: z.string().optional(),
    /** Set to cascade: this select waits for the named parent's value. */
    parentParameterName: z.string().optional(),
    rangeMin: z.coerce.number().default(0),
    rangeMax: z.coerce.number().default(100),
    rangeStep: z.coerce.number().default(1),
    placeholder: z.string().optional(),
    searchable: z.boolean().default(true),
    rangeNumberType: z.enum(["integer", "float"]).default("integer"),
    // Preset names, never colours (#2368). `.catch`, not `.default`: any parse
    // failure sends safeParseSettings back to defaults for the WHOLE object,
    // so one bad value here would lose parameterName too.
    fieldFill: z
      .enum(["default", "azure", "citrine", "sage", "rose"])
      .catch("default"),
    fieldBorder: z
      .enum(["default", "azure", "citrine", "sage", "ink"])
      .catch("default"),
  })
  .strip();

export type ParameterSelectSettings = z.infer<
  typeof parameterSelectSettingsSchema
>;

/**
 * The wrapper attributes that make design-tokens.css redefine --field and
 * --input for a filter's subtree (#2368). Nothing for a default, so an
 * unstyled filter renders exactly as before. Values come from the enum.
 */
export function fieldLookAttrs(
  s: Pick<ParameterSelectSettings, "fieldFill" | "fieldBorder">,
) {
  return {
    "data-field-fill": s.fieldFill === "default" ? undefined : s.fieldFill,
    "data-field-border":
      s.fieldBorder === "default" ? undefined : s.fieldBorder,
  };
}
