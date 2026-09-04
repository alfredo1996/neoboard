/**
 * Zod settings schema for the graph widget plugin.
 */
import { z } from "zod";

export const graphSettingsSchema = z
  .object({
    layout: z.enum(["force", "circular", "hierarchical"]).default("force"),
    showLabels: z.boolean().default(true),
    showRelationshipLabels: z.boolean().default(true),
  })
  .passthrough();

export type GraphSettings = z.infer<typeof graphSettingsSchema>;
