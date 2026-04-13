/**
 * Zod settings schema for the map widget plugin.
 */
import { z } from "zod";

export const mapSettingsSchema = z
  .object({
    tileLayer: z.string().optional(),
    zoom: z.coerce.number().optional(),
    minZoom: z.coerce.number().optional(),
    maxZoom: z.coerce.number().optional(),
    autoFitBounds: z.boolean().default(true),
    clusterMarkers: z.boolean().default(false),
  })
  .passthrough();

export type MapSettings = z.infer<typeof mapSettingsSchema>;
