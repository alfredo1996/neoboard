/**
 * Zod settings schema for the line chart plugin.
 */
import { z } from "zod";

export const lineSettingsSchema = z
  .object({
    smooth: z.boolean().default(false),
    area: z.boolean().default(false),
    xAxisLabel: z.string().optional(),
    yAxisLabel: z.string().optional(),
    rightYAxisLabel: z.string().optional(),
    rightAxisSeries: z.string().optional(),
    showLegend: z.boolean().default(true),
    decimalPlaces: z.coerce.number().optional(),
    legendPosition: z
      .enum(["top", "bottom", "left", "right"])
      .default("bottom"),
    lineWidth: z.coerce.number().default(2),
    stepped: z.boolean().default(false),
    showPoints: z.boolean().default(false),
    showGridLines: z.boolean().default(true),
    connectNulls: z.boolean().default(false),
    endLabel: z.boolean().default(false),
    referenceLines: z.string().optional(),
    enableDataZoom: z.boolean().default(false),
    colorPalette: z.string().optional(),
    colorblindMode: z.boolean().default(false),
  })
  .passthrough();

export type LineSettings = z.infer<typeof lineSettingsSchema>;
