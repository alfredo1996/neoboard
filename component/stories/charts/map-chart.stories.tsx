import type { Meta, StoryObj } from "@storybook/react";
import { expect, waitFor, within } from "storybook/test";
import { MapChart } from "@/charts/map-chart";
import { MAP_MARKER_DEFAULT_COLOR } from "@/lib/design-tokens";

const meta = {
  title: "Charts/MapChart",
  component: MapChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ height: 500, width: "100%" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MapChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Leaflet draws each `circleMarker` as one `<path>` in the overlay pane, with
 * the marker colour on `fill` and the radius baked into the `d` arc — so
 * marker count, colour and size are all real DOM, no pixels needed. This is
 * the only chart in the package where the data is directly queryable.
 */
function markerPaths(canvasElement: HTMLElement) {
  return Array.from(
    canvasElement.querySelectorAll<SVGPathElement>(
      ".leaflet-overlay-pane path",
    ),
  );
}

/** `M259,157a20,20 0 1,0 40,0 …` — the arc radius is the marker radius. */
function markerRadius(path: SVGPathElement) {
  const m = /a([\d.]+),/.exec(path.getAttribute("d") ?? "");
  return m ? Number(m[1]) : NaN;
}

/** Leaflet tile URLs are `…/{z}/{x}/{y}.png`, so the zoom level is in the DOM. */
function tileZooms(canvasElement: HTMLElement) {
  return Array.from(
    canvasElement.querySelectorAll<HTMLImageElement>("img.leaflet-tile"),
  )
    .map((img) => /\/(\d+)\/\d+\/\d+\.png/.exec(img.src)?.[1])
    .filter((z): z is string => z !== undefined)
    .map(Number);
}

const worldCities = [
  { id: "1", lat: 40.7128, lng: -74.006, label: "New York", value: 20 },
  { id: "2", lat: 51.5074, lng: -0.1278, label: "London", value: 18 },
  { id: "3", lat: 35.6762, lng: 139.6503, label: "Tokyo", value: 22 },
  { id: "4", lat: -33.8688, lng: 151.2093, label: "Sydney", value: 10 },
  { id: "5", lat: 48.8566, lng: 2.3522, label: "Paris", value: 15 },
  { id: "6", lat: -23.5505, lng: -46.6333, label: "São Paulo", value: 16 },
  { id: "7", lat: 55.7558, lng: 37.6173, label: "Moscow", value: 12 },
  { id: "8", lat: 28.6139, lng: 77.209, label: "Delhi", value: 25 },
];

export const Default: Story = {
  args: {
    markers: worldCities,
    center: [20, 0],
    zoom: 2,
  },
  // One path per row, each sized from that row's `value` — the assertion the
  // blank-map defect (#1398) would have failed. `radius` is
  // `clamp(value, 4, 30)`, so this also pins the size mapping.
  play: async ({ canvasElement, args }) => {
    await waitFor(() =>
      expect(markerPaths(canvasElement)).toHaveLength(args.markers!.length),
    );
    expect(markerPaths(canvasElement).map(markerRadius)).toEqual(
      worldCities.map((c) => c.value),
    );
    expect(
      new Set(markerPaths(canvasElement).map((p) => p.getAttribute("fill"))),
    ).toEqual(new Set([MAP_MARKER_DEFAULT_COLOR]));
    // Tiles are requested at the zoom that was asked for, not at maxZoom.
    await waitFor(() =>
      expect(tileZooms(canvasElement).length).toBeGreaterThan(0),
    );
    expect(new Set(tileZooms(canvasElement))).toEqual(new Set([args.zoom]));
  },
};

export const AutoFitBounds: Story = {
  args: {
    markers: worldCities,
    autoFitBounds: true,
  },
  // #1398: fitting against a zero-size container resolved to maxZoom and left
  // the map zoomed past every marker — a white rectangle with the markers
  // still technically present. Marker count alone would have passed that.
  // Cities on five continents can only fit at a low zoom, and the tile URLs
  // carry the zoom the fit actually chose.
  play: async ({ canvasElement, args }) => {
    await waitFor(() =>
      expect(markerPaths(canvasElement)).toHaveLength(args.markers!.length),
    );
    await waitFor(() =>
      expect(tileZooms(canvasElement).length).toBeGreaterThan(0),
    );
    for (const z of tileZooms(canvasElement)) {
      expect(z).toBeLessThanOrEqual(5);
    }
  },
};

export const CartoLight: Story = {
  args: {
    markers: worldCities,
    tileLayer: "carto-light",
    autoFitBounds: true,
  },
};

export const CartoDark: Story = {
  args: {
    markers: worldCities,
    tileLayer: "carto-dark",
    autoFitBounds: true,
  },
};

export const WithPopups: Story = {
  args: {
    markers: [
      {
        id: "1",
        lat: 40.7128,
        lng: -74.006,
        label: "New York",
        value: 20,
        popup: "<b>New York City</b><br/>Population: 8.3M<br/>State: New York",
      },
      {
        id: "2",
        lat: 51.5074,
        lng: -0.1278,
        label: "London",
        value: 18,
        popup: "<b>London</b><br/>Population: 8.9M<br/>Country: United Kingdom",
      },
      {
        id: "3",
        lat: 35.6762,
        lng: 139.6503,
        label: "Tokyo",
        value: 22,
        popup: "<b>Tokyo</b><br/>Population: 13.9M<br/>Country: Japan",
      },
    ],
    autoFitBounds: true,
  },
  // Only the marker count is asserted here: opening a popup needs a real
  // Leaflet click, and a synthetic one makes Leaflet's own coordinate maths
  // throw "Invalid LatLng object: (NaN, NaN)" inside `_fireDOMEvent`. Popup
  // *content* therefore stays E2E's job.
  play: async ({ canvasElement, args }) => {
    await waitFor(() =>
      expect(markerPaths(canvasElement)).toHaveLength(args.markers!.length),
    );
  },
};

export const WithProperties: Story = {
  args: {
    markers: [
      {
        id: "1",
        lat: 40.7128,
        lng: -74.006,
        label: "NYC Office",
        value: 15,
        properties: { region: "Americas", employees: 250, status: "Active" },
      },
      {
        id: "2",
        lat: 51.5074,
        lng: -0.1278,
        label: "London Office",
        value: 12,
        properties: { region: "EMEA", employees: 180, status: "Active" },
      },
      {
        id: "3",
        lat: 1.3521,
        lng: 103.8198,
        label: "Singapore Office",
        value: 8,
        properties: { region: "APAC", employees: 90, status: "New" },
      },
    ],
    autoFitBounds: true,
    fitBoundsPadding: [40, 40],
  },
};

export const ZoomedIn: Story = {
  args: {
    markers: [
      { id: "1", lat: 40.7128, lng: -74.006, label: "New York", value: 20 },
      { id: "2", lat: 40.758, lng: -73.9855, label: "Times Square", value: 8 },
      {
        id: "3",
        lat: 40.7484,
        lng: -73.9857,
        label: "Empire State",
        value: 12,
      },
    ],
    center: [40.75, -73.99],
    zoom: 13,
  },
};

export const ColorCoded: Story = {
  args: {
    markers: [
      {
        id: "1",
        lat: 40.71,
        lng: -74.0,
        label: "Critical",
        value: 15,
        color: "#ef4444",
      },
      {
        id: "2",
        lat: 51.51,
        lng: -0.13,
        label: "Warning",
        value: 12,
        color: "#f59e0b",
      },
      {
        id: "3",
        lat: 35.68,
        lng: 139.65,
        label: "Healthy",
        value: 10,
        color: "#22c55e",
      },
      {
        id: "4",
        lat: 48.86,
        lng: 2.35,
        label: "Healthy",
        value: 8,
        color: "#22c55e",
      },
    ],
    center: [30, 40],
    zoom: 2,
  },
  // Per-marker colour is the whole point of this story and it is a plain
  // attribute — a dropped `m.color` would fall back to the default token and
  // still render four markers.
  play: async ({ canvasElement, args }) => {
    await waitFor(() =>
      expect(markerPaths(canvasElement)).toHaveLength(args.markers!.length),
    );
    expect(
      markerPaths(canvasElement).map((p) => p.getAttribute("fill")),
    ).toEqual(args.markers!.map((m) => m.color));
  },
};

export const Loading: Story = {
  args: {
    markers: worldCities,
    loading: true,
  },
};

export const ErrorState: Story = {
  args: {
    error: new Error("Failed to load map data"),
  },
  play: async ({ canvasElement, args }) => {
    const alert = await within(canvasElement).findByRole("alert");
    expect(alert).toHaveTextContent(args.error!.message);
    expect(canvasElement.querySelector('[data-testid="map-chart"]')).toBeNull();
  },
};

export const Empty: Story = {
  args: {
    markers: [],
    center: [20, 0],
    zoom: 2,
  },
  // The map itself still mounts — "no rows" is not an error — but nothing is
  // plotted, and no invalid-coordinate notice is shown.
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.querySelector(".leaflet-container")).not.toBeNull(),
    );
    expect(markerPaths(canvasElement)).toHaveLength(0);
    expect(within(canvasElement).queryByRole("status")).toBeNull();
    expect(within(canvasElement).queryByRole("alert")).toBeNull();
  },
};

/**
 * #1288 — one row whose latitude arrived as text made Leaflet's `LatLng`
 * throw and took the whole map down with it. Bad rows are dropped and
 * counted instead, and the count is surfaced rather than swallowed.
 */
export const InvalidCoordinates: Story = {
  args: {
    markers: [
      ...worldCities,
      {
        id: "9",
        lat: Number.NaN,
        lng: 12.4964,
        label: "Bad latitude",
        value: 9,
      },
      {
        id: "10",
        lat: 41.9028,
        lng: Number.POSITIVE_INFINITY,
        label: "Bad longitude",
        value: 9,
      },
    ],
    center: [20, 0],
    zoom: 2,
  },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(markerPaths(canvasElement)).toHaveLength(worldCities.length),
    );
    expect(await within(canvasElement).findByRole("status")).toHaveTextContent(
      "2 rows skipped (invalid coordinates)",
    );
  },
};
