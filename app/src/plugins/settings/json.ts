/**
 * Zod settings schema for the JSON viewer plugin.
 */
import { z } from "zod";

export const jsonSettingsSchema = z
  .object({
    initialExpanded: z.coerce.number().default(2),
  })
  .passthrough();

export type JsonSettings = z.infer<typeof jsonSettingsSchema>;
