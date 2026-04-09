/**
 * Zod settings schema for the parameter selector widget plugin.
 */
import { z } from "zod";

export const parameterSelectSettingsSchema = z
  .object({
    parameterName: z.string().optional(),
    parameterType: z
      .enum([
        "select",
        "text",
        "date",
        "date-range",
        "date-relative",
        "number-range",
        "multi-select",
        "cascading-select",
      ])
      .default("select"),
    seedQuery: z.string().optional(),
    parentParameterName: z.string().optional(),
    rangeMin: z.coerce.number().default(0),
    rangeMax: z.coerce.number().default(100),
    rangeStep: z.coerce.number().default(1),
    placeholder: z.string().optional(),
    searchable: z.boolean().default(true),
  })
  .passthrough();

export type ParameterSelectSettings = z.infer<
  typeof parameterSelectSettingsSchema
>;
