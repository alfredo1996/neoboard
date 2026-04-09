/**
 * Zod settings schema for the treemap chart plugin.
 */
import { z } from "zod";

export const treemapSettingsSchema = z
  .object({
    showLabels: z.boolean().default(true),
    showBreadcrumb: z.boolean().default(true),
    showValues: z.boolean().default(false),
    colorSaturation: z.enum(["low", "medium", "high"]).default("medium"),
    colorPalette: z.string().optional(),
    colorblindMode: z.boolean().default(false),
  })
  .passthrough();

export type TreemapSettings = z.infer<typeof treemapSettingsSchema>;
