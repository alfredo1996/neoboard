import { z } from "zod";
import {
  CHOROPLETH_DEFAULT_MIN_COLOR,
  CHOROPLETH_DEFAULT_MAX_COLOR,
} from "@neoboard/components/charts/choropleth-ramp";

export const choroplethSettingsSchema = z
  .object({
    showLabels: z.boolean().default(false),
    showVisualMap: z.boolean().default(true),
    roam: z.boolean().default(true),
    // Ends of the component's single warm ramp. These used to be ColorBrewer
    // Blues while the chart spliced them onto hardcoded warm stops, shipping a
    // ramp that ran pale-blue -> orange -> navy (#1404). Sourced from the
    // component so the two cannot drift again.
    minColor: z.string().default(CHOROPLETH_DEFAULT_MIN_COLOR),
    maxColor: z.string().default(CHOROPLETH_DEFAULT_MAX_COLOR),
    colorPalette: z.string().optional(),
    colorblindMode: z.boolean().default(false),
  })
  .passthrough();

export type ChoroplethSettings = z.infer<typeof choroplethSettingsSchema>;
