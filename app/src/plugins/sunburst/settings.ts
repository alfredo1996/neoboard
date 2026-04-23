/**
 * Zod settings schema for the sunburst chart plugin.
 */
import { z } from "zod";

export const sunburstSettingsSchema = z
  .object({
    showLabels: z.boolean().default(true),
    maxLabelDepth: z.coerce.number().default(2),
    sort: z.enum(["desc", "asc", "none"]).default("desc"),
    highlightOnHover: z.boolean().default(true),
    colorPalette: z.string().optional(),
    colorblindMode: z.boolean().default(false),
  })
  .passthrough();

export type SunburstSettings = z.infer<typeof sunburstSettingsSchema>;
