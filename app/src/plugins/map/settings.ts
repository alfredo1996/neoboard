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
    // Clamped rather than rejected: the editor offers a free number input, and
    // a rejected field would reset every other setting to its default.
    markerSize: z.coerce.number().min(1).max(50).catch(6).default(6),
  })
  .passthrough();

export type MapSettings = z.infer<typeof mapSettingsSchema>;
