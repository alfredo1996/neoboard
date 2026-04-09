/**
 * Zod settings schema for the gauge chart plugin.
 */
import { z } from "zod";

export const gaugeSettingsSchema = z
  .object({
    min: z.coerce.number().default(0),
    max: z.coerce.number().default(100),
    showProgress: z.boolean().default(true),
    showPointer: z.boolean().default(true),
    showDetail: z.boolean().default(true),
    startAngle: z.coerce.number().default(225),
    endAngle: z.coerce.number().default(-45),
    colorPalette: z.string().optional(),
    colorblindMode: z.boolean().default(false),
  })
  .passthrough();

export type GaugeSettings = z.infer<typeof gaugeSettingsSchema>;
