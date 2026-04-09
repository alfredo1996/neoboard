/**
 * Zod settings schema for the single-value chart plugin.
 */
import { z } from "zod";

export const singleValueSettingsSchema = z
  .object({
    title: z.string().optional(),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    fontSize: z.enum(["sm", "md", "lg", "xl"]).default("lg"),
    numberFormat: z
      .enum(["plain", "comma", "compact", "percent"])
      .default("plain"),
    decimalPlaces: z.coerce.number().optional(),
  })
  .passthrough();

export type SingleValueSettings = z.infer<typeof singleValueSettingsSchema>;
