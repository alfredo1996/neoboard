/**
 * Zod settings schema for the markdown widget plugin.
 */
import { z } from "zod";

export const markdownSettingsSchema = z
  .object({
    content: z.string().optional(),
  })
  .passthrough();

export type MarkdownSettings = z.infer<typeof markdownSettingsSchema>;
