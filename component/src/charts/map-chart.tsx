import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { cn } from "@/lib/utils";
import { MAP_MARKER_DEFAULT_COLOR } from "@/lib/design-tokens";
import type { StylingRule } from "./styling-rule";
import { resolveStylingRuleColor } from "./styling-rule";
import { escapeHtml } from "./chart-utils";

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
  /** Group nearby markers into clusters that expand on click/zoom */
  clusterMarkers?: boolean;
  /** Show popup when marker is clicked */
  showPopup?: boolean;
  loading?: boolean;
  error?: Error | null;
  onMarkerClick?: (marker: MapMarker) => void;
  /** Rule-based styling rules for marker color/size */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for styling rule evaluation */
  paramValues?: Record<string, unknown>;
  className?: string;
}

const TILE_PRESETS: Record<
  TileLayerPreset,
  { url: string; attribution: string }
> = {
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  "carto-light": {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  "carto-dark": {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
};

const DEFAULT_CENTER: [number, number] = [40, -3];
const DEFAULT_ZOOM = 3;
/**
 * Module-level default so an omitted `fitBoundsPadding` prop keeps a stable
 * identity across renders. An inline `[20, 20]` default literal would be a
 * fresh array every render, re-triggering the fit-bounds effect and snapping
 * the user's pan/zoom back on any unrelated re-render.
 */
const DEFAULT_FIT_PADDING: [number, number] = [20, 20];

/**
 * Resolve the tile layer, defaulting to OSM when no explicit preset is given.
 *
 * The default used to switch on theme between `carto-light` and `carto-dark`.
 * CARTO now requires an API key for `basemaps.cartocdn.com` and, without one,
 * returns HTTP 200 with a real PNG that has "API KEY REQUIRED" burned into the
 * image — so every map in the product rendered watermarked while nothing
 * errored, logged or fell back (#1529).
 *
 * OSM needs no key. It has no dark variant, so dark mode is handled by a CSS
 * filter on `.leaflet-tile-pane` (see `index.css`) rather than by swapping
 * providers here — which is why this no longer depends on the theme at all.
 * The CARTO presets remain selectable for anyone who has a key.
 */
function resolveTileLayer(tileLayer: string | undefined, attribution?: string) {
  const effectivePreset = tileLayer ?? "osm";
  if (effectivePreset in TILE_PRESETS) {
    const preset = TILE_PRESETS[effectivePreset as TileLayerPreset];
    return { url: preset.url, attribution: attribution ?? preset.attribution };
  }
  return {
    url: effectivePreset,
    attribution:
      attribution ??
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  };
}

function buildPropertiesTooltip(marker: MapMarker): string {
  const parts: string[] = [];
  if (marker.label) parts.push(`<b>${escapeHtml(marker.label)}</b>`);
  if (marker.properties && Object.keys(marker.properties).length > 0) {
    for (const [k, v] of Object.entries(marker.properties)) {
      parts.push(`<b>${escapeHtml(k)}:</b> ${escapeHtml(String(v))}`);
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
  fitBoundsPadding = DEFAULT_FIT_PADDING,
  markerSize = 6,
  clusterMarkers = false,
  showPopup = true,
  loading = false,
  error = null,
  onMarkerClick,
  stylingRules,
  paramValues,
  className,
}: MapChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Leaflet's LatLng constructor throws on non-finite input, and MapChart does
  // not go through BaseChart's setOption try/catch — so one row whose latitude
  // column held "40.7128 N" took down the entire map, all 999 good markers
  // with it, showing only "Chart failed to render" (#1288). Filtered here
  // rather than in the map transform because markers reaching this component
  // are not required to have come from it.
  const validMarkers = useMemo(
    () =>
      markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng)),
    [markers],
  );
  const skippedCount = markers.length - validMarkers.length;

  // Latest-ref for the click callback so a fresh inline `onMarkerClick`
  // identity (the common case — parents pass an arrow) does not re-run the
  // marker-build effect and tear down/rebuild every marker on each render.
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;

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

    const tl = L.tileLayer(tile.url, { attribution: tile.attribution }).addTo(
      map,
    );
    tileLayerRef.current = tl;
    markersLayerRef.current = (
      clusterMarkers ? L.markerClusterGroup() : L.layerGroup()
    ).addTo(map);
    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      // Leaflet's zoom animation arms a bare `setTimeout(_onZoomTransitionEnd,
      // 250)` that `map.remove()` never cancels — unmounting mid-zoom lets it
      // fire against a map whose `_mapPane` has just been deleted and throw
      // "Cannot read properties of undefined (reading '_leaflet_pos')".
      // `_onZoomTransitionEnd` early-returns on a falsy `_animatingZoom`, so
      // clearing the flag disarms both that timer and the transitionend path.
      (map as L.Map & { _animatingZoom: boolean })._animatingZoom = false;
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      tileLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap tile layer when theme changes (or when tileLayer prop changes)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const tl = L.tileLayer(tile.url, { attribution: tile.attribution }).addTo(
      map,
    );
    tileLayerRef.current = tl;
  }, [tile.url, tile.attribution]);

  // Update center/zoom (only when not auto-fitting)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || autoFitBounds) return;
    map.setView(center, zoom);
  }, [center, zoom, autoFitBounds]);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Swap layer type if clusterMarkers changed
    if (markersLayerRef.current) {
      map.removeLayer(markersLayerRef.current);
    }
    const layer = (
      clusterMarkers ? L.markerClusterGroup() : L.layerGroup()
    ).addTo(map);
    markersLayerRef.current = layer;

    validMarkers.forEach((m) => {
      // Rule-based color: evaluate against marker.value
      const ruleColor =
        stylingRules?.length && m.value != null
          ? resolveStylingRuleColor(m.value, stylingRules, paramValues)
          : undefined;
      const markerColor = ruleColor ?? m.color ?? MAP_MARKER_DEFAULT_COLOR;

      const circleMarker = L.circleMarker([m.lat, m.lng], {
        radius: m.value ? Math.min(Math.max(m.value, 4), 30) : markerSize,
        fillColor: markerColor,
        color: markerColor,
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

      // Always bind via the ref wrapper so the latest handler is invoked
      // without making `onMarkerClick` an effect dependency.
      circleMarker.on("click", () => onMarkerClickRef.current?.(m));

      circleMarker.addTo(layer);
    });
  }, [
    validMarkers,
    markerSize,
    clusterMarkers,
    showPopup,
    stylingRules,
    paramValues,
  ]);

  // Auto-fit bounds — kept in its own effect so that rebuilding markers (for a
  // style/handler change) never re-fits the map. Re-fitting only happens when
  // the markers themselves change, preserving the user's pan/zoom otherwise.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !autoFitBounds || validMarkers.length === 0) return;
    const bounds = L.latLngBounds(
      validMarkers.map((m) => [m.lat, m.lng] as [number, number]),
    );
    map.fitBounds(bounds, { padding: fitBoundsPadding });
  }, [validMarkers, autoFitBounds, fitBoundsPadding]);

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
      {skippedCount > 0 && (
        // Dropping the rows silently would hide the data problem, which is the
        // part the operator can actually fix.
        <div
          role="status"
          className="absolute bottom-2 left-2 z-[1000] rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground"
        >
          {skippedCount} rows skipped (invalid coordinates)
        </div>
      )}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-[1000]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}

export { MapChart };
