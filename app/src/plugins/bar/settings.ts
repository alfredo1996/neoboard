/**
 * Zod settings schema for the bar chart plugin.
 */
import { z } from "zod";

export const barSettingsSchema = z
  .object({
    orientation: z.enum(["vertical", "horizontal"]).default("vertical"),
    stackMode: z.enum(["none", "stacked", "percent"]).default("none"),
    /** @deprecated Use stackMode instead. Kept for backward compatibility. */
    stacked: z.boolean().default(false),
    showValues: z.boolean().default(false),
    decimalPlaces: z.coerce.number().optional(),
    showLegend: z.boolean().optional(),
    barWidth: z.coerce.number().default(0),
    barGap: z.string().default("30%"),
    xAxisLabel: z.string().optional(),
    yAxisLabel: z.string().optional(),
    showGridLines: z.boolean().default(true),
    axisLabelRotation: z.coerce.number().default(-1),
    referenceLines: z.string().optional(),
    enableDataZoom: z.boolean().default(false),
    colorPalette: z.string().optional(),
    colorblindMode: z.boolean().default(false),
  })
  .passthrough();

export type BarSettings = z.infer<typeof barSettingsSchema>;
