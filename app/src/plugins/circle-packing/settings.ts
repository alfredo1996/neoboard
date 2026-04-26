import { z } from "zod";

export const circlePackingSettingsSchema = z
  .object({
    showLabels: z.boolean().default(true),
    padding: z.coerce.number().default(3),
    colorPalette: z.string().optional(),
    colorblindMode: z.boolean().default(false),
  })
  .passthrough();

export type CirclePackingSettings = z.infer<typeof circlePackingSettingsSchema>;
