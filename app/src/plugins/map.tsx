/**
 * Map chart plugin.
 *
 * Leaflet-based map with markers. Supports click actions and rule-based
 * styling. Heavy dependency — lazy loaded only when a map widget appears.
 */

import dynamic from "next/dynamic";
import type { MapMarker, StylingRule } from "@neoboard/components";
import { defineChartPlugin } from "./registry";
import { transformToMapData, validateMapData } from "./transforms/map";
import { type PluginProps } from "./utils";

// Leaflet relies on window/document — must be loaded client-side only.
const MapChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.MapChart })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    ),
  },
);

function MapPluginComponent({
  data,
  settings,
  stylingRules,
  paramValues,
  onChartClick,
}: PluginProps) {
  const markers = (data ?? []) as MapMarker[];
  return (
    <MapChart
      markers={markers}
      tileLayer={settings.tileLayer as string | undefined}
      zoom={settings.zoom as number | undefined}
      minZoom={settings.minZoom as number | undefined}
      maxZoom={settings.maxZoom as number | undefined}
      autoFitBounds={settings.autoFitBounds !== false}
      onMarkerClick={
        onChartClick
          ? (m) =>
              onChartClick({
                id: m.id,
                label: m.label,
                lat: m.lat,
                lng: m.lng,
              })
          : undefined
      }
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
    />
  );
}

export const mapPlugin = defineChartPlugin({
  type: "map",
  label: "Map",
  component: MapPluginComponent,
  transform: transformToMapData,
  transformWithMapping: transformToMapData,
  validate: validateMapData,
  compatibleWith: ["neo4j", "postgresql"],
  stylingTargets: [{ value: "color", label: "Marker Color" }],
  capabilities: {
    supportsClickAction: true,
    supportsStyling: true,
    isECharts: false,
    requiresQuery: true,
  },
  queryHint:
    "Return columns with latitude and longitude (names matching lat/lng/lon).\n" +
    "Example: RETURN name, latitude, longitude",
});
