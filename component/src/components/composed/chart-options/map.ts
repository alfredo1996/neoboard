import { type ChartOptionDef } from "./shared";

export const mapOptions: ChartOptionDef[] = [
  {
    key: "tileLayer",
    label: "Tile Layer",
    type: "text",
    // Same literal as OSM_TILE_URL in charts/map-chart.tsx; a test pins the
    // two together. Not imported: this module must not pull Leaflet in.
    default: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    category: "Map",
    description:
      'Tile URL template with {z}/{x}/{y}, or "none" for a plain background and no tiles.',
  },
  {
    key: "attribution",
    label: "Attribution",
    type: "text",
    default: "",
    category: "Map",
    description:
      "Credit shown on the map for a custom tile server. OpenStreetMap is credited by itself.",
  },
  {
    key: "zoom",
    label: "Default Zoom",
    type: "number",
    default: 3,
    category: "Map",
    description:
      "Initial zoom level when the map first renders (1 = world view, 18 = street level).",
  },
  {
    key: "minZoom",
    label: "Min Zoom",
    type: "number",
    default: 2,
    category: "Map",
    description: "Minimum zoom level the user can zoom out to.",
  },
  {
    key: "maxZoom",
    label: "Max Zoom",
    type: "number",
    default: 18,
    category: "Map",
    description: "Maximum zoom level the user can zoom in to.",
  },
  {
    key: "autoFitBounds",
    label: "Auto-fit Bounds",
    type: "boolean",
    default: true,
    category: "Map",
    description:
      "Automatically pan and zoom to fit all markers on the initial load.",
  },
  {
    key: "markerSize",
    label: "Marker Size (px)",
    type: "number",
    default: 6,
    category: "Markers",
    description: "Radius of each map marker circle in pixels.",
  },
  {
    key: "clusterMarkers",
    label: "Cluster Markers",
    type: "boolean",
    default: false,
    category: "Markers",
    description:
      "Group nearby markers into a single cluster badge at lower zoom levels.",
  },
];
