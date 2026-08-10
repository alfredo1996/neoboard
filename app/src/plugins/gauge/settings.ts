/**
 * Zod settings schema for the gauge chart plugin.
 */
import { z } from "zod";

export const gaugeSettingsSchema = z
  .object({
    min: z.coerce.number().default(0),
    max: z.coerce.number().default(100),
    showProgress: z.boolean().default(true),
    showDetail: z.boolean().default(true),
    startAngle: z.coerce.number().default(225),
    endAngle: z.coerce.number().default(-45),
    colorPalette: z.string().optional(),
    colorblindMode: z.boolean().default(false),
    // JSON array of {value, color} bands, parsed by the chart. Declared here
    // for typing — `.passthrough()` never stripped it; the plugin simply did
    // not forward it (#1397).
    thresholdZones: z.string().optional(),
  })
  .passthrough();

export type GaugeSettings = z.infer<typeof gaugeSettingsSchema>;
