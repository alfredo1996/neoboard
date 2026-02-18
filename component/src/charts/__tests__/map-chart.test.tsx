import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock leaflet
const mockSetView = vi.fn();
const mockFitBounds = vi.fn();
const mockInvalidateSize = vi.fn();
const mockRemove = vi.fn();
const mockAddTo = vi.fn().mockReturnThis();
const mockClearLayers = vi.fn();
const mockBindTooltip = vi.fn().mockReturnThis();
const mockBindPopup = vi.fn().mockReturnThis();
const mockOn = vi.fn().mockReturnThis();

const mockLayerGroup = {
  addTo: mockAddTo,
  clearLayers: mockClearLayers,
};

const mockCircleMarker = {
  addTo: mockAddTo,
  bindTooltip: mockBindTooltip,
  bindPopup: mockBindPopup,
  on: mockOn,
};

const mockLatLngBounds = { isValid: () => true };

vi.mock("leaflet", () => ({
  default: {
    map: vi.fn(() => ({
      setView: mockSetView,
      fitBounds: mockFitBounds,
      invalidateSize: mockInvalidateSize,
      remove: mockRemove,
    })),
    tileLayer: vi.fn(() => ({ addTo: mockAddTo })),
    layerGroup: vi.fn(() => mockLayerGroup),
    circleMarker: vi.fn(() => mockCircleMarker),
    latLngBounds: vi.fn(() => mockLatLngBounds),
  },
}));

// Mock leaflet CSS import
vi.mock("leaflet/dist/leaflet.css", () => ({}));

import L from "leaflet";
import { MapChart } from "../map-chart";

describe("MapChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders map container", () => {
    render(<MapChart />);
    expect(screen.getByTestId("map-chart")).toBeInTheDocument();
  });

  it("renders error state", () => {
    render(<MapChart error={new Error("Map failed")} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Map failed")).toBeInTheDocument();
  });

  it("does not render map container when error", () => {
    render(<MapChart error={new Error("Oops")} />);
    expect(screen.queryByTestId("map-chart")).not.toBeInTheDocument();
  });

  it("renders loading overlay when loading", () => {
    const { container } = render(<MapChart loading />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("does not render loading overlay when not loading", () => {
    const { container } = render(<MapChart />);
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<MapChart className="custom-map" />);
    expect(container.firstChild).toHaveClass("custom-map");
  });

  it("renders with markers", () => {
    const markers = [
      { id: "1", lat: 40.7, lng: -74.0, label: "New York" },
      { id: "2", lat: 51.5, lng: -0.1, label: "London" },
    ];
    render(<MapChart markers={markers} />);
    expect(screen.getByTestId("map-chart")).toBeInTheDocument();
  });

  it("renders with empty markers array", () => {
    render(<MapChart markers={[]} />);
    expect(screen.getByTestId("map-chart")).toBeInTheDocument();
  });

  it("uses OSM tile layer by default", () => {
    render(<MapChart />);
    expect(L.tileLayer).toHaveBeenCalledWith(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      expect.objectContaining({ attribution: expect.stringContaining("OpenStreetMap") }),
    );
  });

  it("uses carto-light tile preset", () => {
    render(<MapChart tileLayer="carto-light" />);
    expect(L.tileLayer).toHaveBeenCalledWith(
      expect.stringContaining("basemaps.cartocdn.com/light_all"),
      expect.any(Object),
    );
  });

  it("uses carto-dark tile preset", () => {
    render(<MapChart tileLayer="carto-dark" />);
    expect(L.tileLayer).toHaveBeenCalledWith(
      expect.stringContaining("basemaps.cartocdn.com/dark_all"),
      expect.any(Object),
    );
  });

  it("uses custom tile URL", () => {
    render(<MapChart tileLayer="https://custom-tiles/{z}/{x}/{y}.png" />);
    expect(L.tileLayer).toHaveBeenCalledWith(
      "https://custom-tiles/{z}/{x}/{y}.png",
      expect.any(Object),
    );
  });

  it("auto-fits bounds to markers when autoFitBounds is true", () => {
    const markers = [
      { id: "1", lat: 40.7, lng: -74.0 },
      { id: "2", lat: 51.5, lng: -0.1 },
    ];
    render(<MapChart markers={markers} autoFitBounds />);
    expect(L.latLngBounds).toHaveBeenCalledWith([
      [40.7, -74.0],
      [51.5, -0.1],
    ]);
    expect(mockFitBounds).toHaveBeenCalledWith(mockLatLngBounds, { padding: [20, 20] });
  });

  it("respects custom fitBoundsPadding", () => {
    const markers = [{ id: "1", lat: 10, lng: 20 }];
    render(<MapChart markers={markers} autoFitBounds fitBoundsPadding={[50, 50]} />);
    expect(mockFitBounds).toHaveBeenCalledWith(mockLatLngBounds, { padding: [50, 50] });
  });

  it("does not call setView when autoFitBounds is true", () => {
    render(<MapChart markers={[{ id: "1", lat: 10, lng: 20 }]} autoFitBounds />);
    // setView is called on mount via L.map config, but the setView useEffect should not fire
    expect(mockSetView).not.toHaveBeenCalled();
  });

  it("binds popup when marker has popup", () => {
    const markers = [
      { id: "1", lat: 40.7, lng: -74.0, popup: "<b>New York</b><br/>Population: 8M" },
    ];
    render(<MapChart markers={markers} />);
    expect(mockBindPopup).toHaveBeenCalledWith("<b>New York</b><br/>Population: 8M");
  });

  it("does not bind popup when marker has no popup", () => {
    const markers = [{ id: "1", lat: 40.7, lng: -74.0, label: "NYC" }];
    render(<MapChart markers={markers} />);
    expect(mockBindPopup).not.toHaveBeenCalled();
  });

  it("renders properties as tooltip HTML", () => {
    const markers = [
      {
        id: "1",
        lat: 40.7,
        lng: -74.0,
        label: "NYC",
        properties: { population: "8M", country: "USA" },
      },
    ];
    render(<MapChart markers={markers} />);
    expect(mockBindTooltip).toHaveBeenCalledWith(
      expect.stringContaining("<b>population:</b> 8M"),
    );
    expect(mockBindTooltip).toHaveBeenCalledWith(
      expect.stringContaining("<b>country:</b> USA"),
    );
  });

  it("does not auto-fit with empty markers", () => {
    render(<MapChart markers={[]} autoFitBounds />);
    expect(mockFitBounds).not.toHaveBeenCalled();
  });
});
