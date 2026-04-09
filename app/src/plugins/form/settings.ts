/**
 * Zod settings schema for the form widget plugin.
 *
 * The form widget passes `settings` through to FormWidgetRenderer as a
 * whole object, so we keep this minimal.
 */
import { z } from "zod";

export const formSettingsSchema = z.object({}).passthrough();

export type FormSettings = z.infer<typeof formSettingsSchema>;
