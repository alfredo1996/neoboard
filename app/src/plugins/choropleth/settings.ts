import { z } from "zod";

export const choroplethSettingsSchema = z
  .object({
    showLabels: z.boolean().default(false),
    showVisualMap: z.boolean().default(true),
    roam: z.boolean().default(true),
    minColor: z.string().default("#e8f4f8"),
    maxColor: z.string().default("#08306b"),
    colorPalette: z.string().optional(),
    colorblindMode: z.boolean().default(false),
  })
  .passthrough();

export type ChoroplethSettings = z.infer<typeof choroplethSettingsSchema>;
