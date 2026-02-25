import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";

export type TileLayerPreset = "osm" | "carto-light" | "carto-dark";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  value?: number;
  color?: string;
  popup?: string;
  properties?: Record<string, unknown>;
}

export interface MapChartProps {
  markers?: MapMarker[];
  center?: [number, number];
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  /** Tile layer preset or custom URL */
  tileLayer?: TileLayerPreset | string;
  attribution?: string;
  /** Auto-fit map bounds to markers */
  autoFitBounds?: boolean;
  /** Padding for fitBounds */
  fitBoundsPadding?: [number, number];
  /** Default marker radius in pixels (used when marker has no value) */
  markerSize?: number;
  /** Show popup when marker is clicked */
  showPopup?: boolean;
  loading?: boolean;
  error?: Error | null;
  onMarkerClick?: (marker: MapMarker) => void;
  className?: string;
}

const TILE_PRESETS: Record<TileLayerPreset, { url: string; attribution: string }> = {
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  "carto-light": {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  "carto-dark": {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
};

const DEFAULT_CENTER: [number, number] = [40, -3];
const DEFAULT_ZOOM = 3;

function resolveTileLayer(tileLayer: TileLayerPreset | string | undefined, attribution?: string) {
  if (!tileLayer || tileLayer in TILE_PRESETS) {
    const preset = TILE_PRESETS[(tileLayer as TileLayerPreset) ?? "osm"];
    return { url: preset.url, attribution: attribution ?? preset.attribution };
  }
  return {
    url: tileLayer,
    attribution: attribution ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  };
}

function buildPropertiesTooltip(marker: MapMarker): string {
  const parts: string[] = [];
  if (marker.label) parts.push(`<b>${marker.label}</b>`);
  if (marker.properties && Object.keys(marker.properties).length > 0) {
    for (const [k, v] of Object.entries(marker.properties)) {
      parts.push(`<b>${k}:</b> ${String(v)}`);
    }
  }
  return parts.join("<br/>");
}

function MapChart({
  markers = [],
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  minZoom = 2,
  maxZoom = 18,
  tileLayer,
  attribution,
  autoFitBounds = false,
  fitBoundsPadding = [20, 20],
  markerSize = 6,
  showPopup = true,
  loading = false,
  error = null,
  onMarkerClick,
  className,
}: MapChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const tile = resolveTileLayer(tileLayer, attribution);

  // Initialize map
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center,
      zoom,
      minZoom,
      maxZoom,
    });

    L.tileLayer(tile.url, { attribution: tile.attribution }).addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update center/zoom (only when not auto-fitting)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || autoFitBounds) return;
    map.setView(center, zoom);
  }, [center, zoom, autoFitBounds]);

  // Update markers
  useEffect(() => {
    const layer = markersLayerRef.current;
    const map = mapRef.current;
    if (!layer) return;

    layer.clearLayers();

    markers.forEach((m) => {
      const circleMarker = L.circleMarker([m.lat, m.lng], {
        radius: m.value ? Math.min(Math.max(m.value, 4), 30) : markerSize,
        fillColor: m.color ?? "#3b82f6",
        color: m.color ?? "#3b82f6",
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.6,
      });

      // Tooltip: properties take priority, then label
      const tooltipHtml = buildPropertiesTooltip(m);
      if (tooltipHtml) {
        circleMarker.bindTooltip(tooltipHtml);
      } else if (m.label) {
        circleMarker.bindTooltip(m.label);
      }

      // Popup: bind only when showPopup is enabled
      if (showPopup && m.popup) {
        circleMarker.bindPopup(m.popup);
      }

      if (onMarkerClick) {
        circleMarker.on("click", () => onMarkerClick(m));
      }

      circleMarker.addTo(layer);
    });

    // Auto-fit bounds
    if (autoFitBounds && map && markers.length > 0) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
      map.fitBounds(bounds, { padding: fitBoundsPadding });
    }
  }, [markers, onMarkerClick, autoFitBounds, fitBoundsPadding, markerSize, showPopup]);

  if (error) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive",
          className,
        )}
        role="alert"
      >
        {error.message}
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div
        ref={containerRef}
        className="h-full w-full"
        data-testid="map-chart"
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-[1000]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}

export { MapChart };
