/**
 * Zod settings schema for the radar chart plugin.
 */
import { z } from "zod";

export const radarSettingsSchema = z
  .object({
    shape: z.enum(["polygon", "circle"]).default("polygon"),
    filled: z.boolean().default(false),
    showLegend: z.boolean().default(true),
    showValues: z.boolean().default(false),
    colorPalette: z.string().optional(),
    colorblindMode: z.boolean().default(false),
  })
  .passthrough();

export type RadarSettings = z.infer<typeof radarSettingsSchema>;
