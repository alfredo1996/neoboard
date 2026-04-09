/**
 * Zod settings schema for the sankey chart plugin.
 */
import { z } from "zod";

export const sankeySettingsSchema = z
  .object({
    orient: z.enum(["horizontal", "vertical"]).default("horizontal"),
    showLabels: z.boolean().default(true),
    nodeWidth: z.coerce.number().default(20),
    nodeGap: z.coerce.number().default(8),
    colorPalette: z.string().optional(),
    colorblindMode: z.boolean().default(false),
  })
  .passthrough();

export type SankeySettings = z.infer<typeof sankeySettingsSchema>;
