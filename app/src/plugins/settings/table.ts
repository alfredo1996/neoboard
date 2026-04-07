/**
 * Zod settings schema for the table widget plugin.
 *
 * The table passes `settings` through to TableRenderer as a whole object,
 * so we keep this minimal. TableRenderer handles its own key extraction.
 */
import { z } from "zod";

export const tableSettingsSchema = z.object({}).passthrough();

export type TableSettings = z.infer<typeof tableSettingsSchema>;
