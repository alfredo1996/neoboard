/**
 * Zod settings schema for the pie / doughnut chart plugin.
 */
import { z } from "zod";

export const pieSettingsSchema = z
  .object({
    donut: z.boolean().default(false),
    showLabel: z.boolean().default(true),
    showLegend: z.boolean().default(true),
    roseMode: z.boolean().default(false),
    labelPosition: z.enum(["outside", "inside", "center"]).default("outside"),
    showPercentage: z.boolean().default(false),
    sortSlices: z.boolean().default(false),
    topN: z.coerce.number().int().min(0).optional(),
    donutCenterText: z.string().optional(),
    colorPalette: z.string().optional(),
    colorblindMode: z.boolean().default(false),
  })
  .passthrough();

export type PieSettings = z.infer<typeof pieSettingsSchema>;
