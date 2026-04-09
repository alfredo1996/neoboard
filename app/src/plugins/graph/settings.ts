/**
 * Zod settings schema for the graph widget plugin.
 */
import { z } from "zod";

export const graphSettingsSchema = z
  .object({
    layout: z.enum(["force", "circular"]).default("force"),
    showLabels: z.boolean().default(true),
  })
  .passthrough();

export type GraphSettings = z.infer<typeof graphSettingsSchema>;
