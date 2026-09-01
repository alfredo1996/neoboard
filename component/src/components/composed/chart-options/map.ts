import { type ChartOptionDef } from "./shared";

export const mapOptions: ChartOptionDef[] = [
  {
    key: "tileLayer",
    label: "Tile Layer",
    type: "select",
    default: "osm",
    category: "Map",
    description:
      "Base-map tiles. OpenStreetMap is free; Carto variants suit data overlays better.",
    options: [
      { label: "OpenStreetMap", value: "osm" },
      { label: "Carto Light", value: "carto-light" },
      { label: "Carto Dark", value: "carto-dark" },
    ],
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
  {
    key: "showPopup",
    label: "Show Popup on Click",
    type: "boolean",
    default: true,
    category: "Markers",
    description:
      "Show a popup with the row data when the user clicks a marker.",
  },
];
