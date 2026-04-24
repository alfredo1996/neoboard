/**
 * Zod settings schema for the Gantt chart plugin.
 */
import { z } from "zod";

export const ganttSettingsSchema = z
  .object({
    showTodayLine: z.boolean().default(true),
    showProgress: z.boolean().default(false),
    showGridLines: z.boolean().default(true),
    barBorderRadius: z.coerce.number().default(2),
    colorPalette: z.string().optional(),
    colorblindMode: z.boolean().default(false),
  })
  .passthrough();

export type GanttSettings = z.infer<typeof ganttSettingsSchema>;
