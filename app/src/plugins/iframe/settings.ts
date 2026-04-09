/**
 * Zod settings schema for the iframe widget plugin.
 */
import { z } from "zod";

export const iframeSettingsSchema = z
  .object({
    url: z.string().optional(),
    iframeTitle: z.string().optional(),
    sandbox: z.string().optional(),
  })
  .passthrough();

export type IframeSettings = z.infer<typeof iframeSettingsSchema>;
