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

const mockRemoveLayer = vi.fn();

vi.mock("leaflet", () => ({
  default: {
    map: vi.fn(() => ({
      setView: mockSetView,
      fitBounds: mockFitBounds,
      invalidateSize: mockInvalidateSize,
      remove: mockRemove,
      removeLayer: mockRemoveLayer,
    })),
    tileLayer: vi.fn(() => ({ addTo: mockAddTo })),
    layerGroup: vi.fn(() => mockLayerGroup),
    markerClusterGroup: vi.fn(() => mockLayerGroup),
    circleMarker: vi.fn(() => mockCircleMarker),
    latLngBounds: vi.fn(() => mockLatLngBounds),
  },
}));

// Mock leaflet CSS imports
vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet.markercluster", () => ({}));
vi.mock("leaflet.markercluster/dist/MarkerCluster.css", () => ({}));
vi.mock("leaflet.markercluster/dist/MarkerCluster.Default.css", () => ({}));

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

  it("uses carto-light tile layer by default in light mode", () => {
    render(<MapChart />);
    expect(L.tileLayer).toHaveBeenCalledWith(
      expect.stringContaining("basemaps.cartocdn.com/light_all"),
      expect.objectContaining({
        attribution: expect.stringContaining("OpenStreetMap"),
      }),
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
    expect(mockFitBounds).toHaveBeenCalledWith(mockLatLngBounds, {
      padding: [20, 20],
    });
  });

  it("respects custom fitBoundsPadding", () => {
    const markers = [{ id: "1", lat: 10, lng: 20 }];
    render(
      <MapChart markers={markers} autoFitBounds fitBoundsPadding={[50, 50]} />,
    );
    expect(mockFitBounds).toHaveBeenCalledWith(mockLatLngBounds, {
      padding: [50, 50],
    });
  });

  it("does not call setView when autoFitBounds is true", () => {
    render(
      <MapChart markers={[{ id: "1", lat: 10, lng: 20 }]} autoFitBounds />,
    );
    // setView is called on mount via L.map config, but the setView useEffect should not fire
    expect(mockSetView).not.toHaveBeenCalled();
  });

  it("binds popup when marker has popup", () => {
    const markers = [
      {
        id: "1",
        lat: 40.7,
        lng: -74.0,
        popup: "<b>New York</b><br/>Population: 8M",
      },
    ];
    render(<MapChart markers={markers} />);
    expect(mockBindPopup).toHaveBeenCalledWith(
      "<b>New York</b><br/>Population: 8M",
    );
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

  // --- Pan/zoom preservation on re-render ---
  // Regression: any parent re-render used to re-run the marker effect (its deps
  // included the inline onMarkerClick identity and the default fitBoundsPadding
  // array), which re-called fitBounds and snapped the user's pan/zoom back.

  it("does not re-fit bounds on re-render when markers are unchanged (new click-handler identity)", () => {
    const markers = [
      { id: "1", lat: 10, lng: 20 },
      { id: "2", lat: 30, lng: 40 },
    ];
    const { rerender } = render(
      <MapChart markers={markers} autoFitBounds onMarkerClick={() => {}} />,
    );
    expect(mockFitBounds).toHaveBeenCalledTimes(1);
    mockFitBounds.mockClear();
    // Re-render with the same markers but a fresh inline handler identity.
    rerender(
      <MapChart markers={markers} autoFitBounds onMarkerClick={() => {}} />,
    );
    expect(mockFitBounds).not.toHaveBeenCalled();
  });

  it("does not rebuild markers on re-render when only the click handler identity changes", () => {
    const markers = [{ id: "1", lat: 10, lng: 20 }];
    const { rerender } = render(
      <MapChart markers={markers} onMarkerClick={() => {}} />,
    );
    expect(L.circleMarker).toHaveBeenCalledTimes(1);
    (L.circleMarker as unknown as ReturnType<typeof vi.fn>).mockClear();
    rerender(<MapChart markers={markers} onMarkerClick={() => {}} />);
    expect(L.circleMarker).not.toHaveBeenCalled();
  });

  it("still re-fits bounds when the markers actually change", () => {
    const markers = [{ id: "1", lat: 10, lng: 20 }];
    const { rerender } = render(<MapChart markers={markers} autoFitBounds />);
    expect(mockFitBounds).toHaveBeenCalledTimes(1);
    mockFitBounds.mockClear();
    rerender(
      <MapChart
        markers={[
          { id: "1", lat: 10, lng: 20 },
          { id: "2", lat: 50, lng: 60 },
        ]}
        autoFitBounds
      />,
    );
    expect(mockFitBounds).toHaveBeenCalledTimes(1);
  });

  it("invokes the latest onMarkerClick after a re-render without rebuilding markers", () => {
    const first = vi.fn();
    const second = vi.fn();
    const markers = [{ id: "1", lat: 10, lng: 20 }];
    const { rerender } = render(
      <MapChart markers={markers} onMarkerClick={first} />,
    );
    // Grab the click handler registered on the marker.
    const clickHandler = mockOn.mock.calls.find(
      (c) => c[0] === "click",
    )?.[1] as (() => void) | undefined;
    expect(clickHandler).toBeDefined();
    rerender(<MapChart markers={markers} onMarkerClick={second} />);
    clickHandler?.();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(markers[0]);
  });

  // --- New options ---

  it("uses markerSize as default radius when marker has no value", () => {
    const markers = [{ id: "1", lat: 10, lng: 20 }];
    render(<MapChart markers={markers} markerSize={12} />);
    expect(L.circleMarker).toHaveBeenCalledWith(
      [10, 20],
      expect.objectContaining({ radius: 12 }),
    );
  });

  it("defaults marker radius to 6 when markerSize is not provided", () => {
    const markers = [{ id: "1", lat: 10, lng: 20 }];
    render(<MapChart markers={markers} />);
    expect(L.circleMarker).toHaveBeenCalledWith(
      [10, 20],
      expect.objectContaining({ radius: 6 }),
    );
  });

  it("binds popup when showPopup is true (default)", () => {
    const markers = [{ id: "1", lat: 10, lng: 20, popup: "<b>Hello</b>" }];
    render(<MapChart markers={markers} />);
    expect(mockBindPopup).toHaveBeenCalledWith("<b>Hello</b>");
  });

  it("does not bind popup when showPopup is false", () => {
    const markers = [{ id: "1", lat: 10, lng: 20, popup: "<b>Hello</b>" }];
    render(<MapChart markers={markers} showPopup={false} />);
    expect(mockBindPopup).not.toHaveBeenCalled();
  });

  describe("rule-based styling", () => {
    it("applies styling rule color to markers matching the rule", () => {
      const markers = [
        { id: "1", lat: 10, lng: 20, value: 80 },
        { id: "2", lat: 30, lng: 40, value: 20 },
      ];
      const rules = [
        { id: "r1", operator: ">=" as const, value: 50, color: "#ff0000" },
      ];
      render(<MapChart markers={markers} stylingRules={rules} />);

      const calls = (L.circleMarker as ReturnType<typeof vi.fn>).mock.calls;
      // First marker (value=80) matches >= 50 → red
      expect(calls[0][1].fillColor).toBe("#ff0000");
      // Second marker (value=20) does NOT match → default color
      expect(calls[1][1].fillColor).not.toBe("#ff0000");
    });

    it("styling rule color takes priority over explicit marker.color", () => {
      const markers = [
        { id: "1", lat: 10, lng: 20, value: 100, color: "#00ff00" },
      ];
      const rules = [
        { id: "r1", operator: ">=" as const, value: 50, color: "#ff0000" },
      ];
      render(<MapChart markers={markers} stylingRules={rules} />);

      const calls = (L.circleMarker as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][1].fillColor).toBe("#ff0000");
    });

    it("does not apply styling when marker has no value", () => {
      const markers = [{ id: "1", lat: 10, lng: 20 }];
      const rules = [
        { id: "r1", operator: ">=" as const, value: 0, color: "#ff0000" },
      ];
      render(<MapChart markers={markers} stylingRules={rules} />);

      const calls = (L.circleMarker as ReturnType<typeof vi.fn>).mock.calls;
      // No value → rule not evaluated → default color
      expect(calls[0][1].fillColor).not.toBe("#ff0000");
    });
  });
  // Leaflet's LatLng constructor throws on non-finite input, and MapChart is
  // the one chart in the package that does not route through BaseChart's
  // try/catch — so a single dirty row replaced the whole map, every valid
  // marker with it, with the generic "Chart failed to render" card (#1288).
  describe("non-finite coordinates (#1288)", () => {
    const good = { id: "1", lat: 40.7128, lng: -74.006 };
    const bad = { id: "2", lat: NaN, lng: NaN };

    // Infinity as well as NaN: Leaflet only throws on NaN, but an infinite
    // coordinate fits the map to an infinite bounds instead — broken either
    // way, and an implementation written with Number.isNaN would pass a
    // NaN-only suite while still shipping that.
    it.each([
      ["NaN", bad],
      ["Infinity", { id: "9", lat: Infinity, lng: -74.006 }],
      ["-Infinity", { id: "9", lat: 40.7128, lng: -Infinity }],
    ])("draws only the finite markers, excluding %s", (_label, dirty) => {
      render(<MapChart markers={[good, dirty]} />);
      const calls = (L.circleMarker as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toEqual([40.7128, -74.006]);
    });

    it("excludes them from the auto-fit bounds", () => {
      render(<MapChart markers={[good, bad]} autoFitBounds />);
      const calls = (L.latLngBounds as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0]).toEqual([[40.7128, -74.006]]);
    });

    it("skips fitBounds entirely when no marker is finite", () => {
      render(
        <MapChart
          markers={[bad, { id: "3", lat: 1, lng: NaN }]}
          autoFitBounds
        />,
      );
      expect(mockFitBounds).not.toHaveBeenCalled();
      expect(screen.getByTestId("map-chart")).toBeInTheDocument();
    });

    it("tells the user how many rows were skipped", () => {
      // Silently dropping them would hide the data problem, which is the
      // thing the operator actually needs to fix.
      render(
        <MapChart
          markers={[
            good,
            { id: "4", lat: 1, lng: 2 },
            { id: "5", lat: 3, lng: 4 },
            bad,
            { id: "6", lat: NaN, lng: 5 },
          ]}
        />,
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "2 rows skipped (invalid coordinates)",
      );
    });

    it("shows no notice when every marker is finite", () => {
      render(<MapChart markers={[good]} />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
