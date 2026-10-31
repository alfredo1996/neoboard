/**
 * Zod settings schema for the markdown widget plugin.
 */
import { z } from "zod";

export const markdownSettingsSchema = z
  .object({
    content: z.string().optional(),
    // A stored value this version does not know reads as unset, not as an error.
    textSize: z.enum(["sm", "md", "lg"]).optional().catch(undefined),
    textAlign: z.enum(["left", "center", "right"]).optional().catch(undefined),
  })
  .passthrough();

export type MarkdownSettings = z.infer<typeof markdownSettingsSchema>;
