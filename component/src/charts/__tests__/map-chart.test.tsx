import { act, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
const mockAddAttribution = vi.fn();
const mockRemoveAttribution = vi.fn();

vi.mock("leaflet", () => ({
  default: {
    map: vi.fn(() => ({
      setView: mockSetView,
      fitBounds: mockFitBounds,
      invalidateSize: mockInvalidateSize,
      remove: mockRemove,
      removeLayer: mockRemoveLayer,
      attributionControl: {
        addAttribution: mockAddAttribution,
        removeAttribution: mockRemoveAttribution,
      },
    })),
    // Real tile layers carry their options; the in-place attribution update
    // reads and writes `options.attribution` on the live layer.
    tileLayer: vi.fn((_url: string, options: object) => ({
      addTo: mockAddTo,
      options,
    })),
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
import { MapChart, OSM_TILE_URL, resolveTileLayer } from "../map-chart";
import { getDefaultChartSettings } from "@/components/composed/chart-options";

/**
 * jsdom reports every element as 0x0, which is exactly the state that made the
 * map go blank (#1398) — so the suite has to be able to say how big the
 * container measures, rather than inheriting the broken case by accident.
 */
const measured = { width: 800, height: 600 };
for (const prop of ["clientWidth", "clientHeight"] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, {
    configurable: true,
    get() {
      return prop === "clientWidth" ? measured.width : measured.height;
    },
  });
}

/** The ResizeObserver callbacks currently registered by the component. */
const resizeCallbacks: ResizeObserverCallback[] = [];
class MockResizeObserver {
  constructor(cb: ResizeObserverCallback) {
    resizeCallbacks.push(cb);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", MockResizeObserver);

/** Fire every registered ResizeObserver as the browser would. */
const fireResize = () => {
  for (const cb of resizeCallbacks) {
    cb([], {} as ResizeObserver);
  }
};

describe("MapChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    measured.width = 800;
    measured.height = 600;
    resizeCallbacks.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
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

  // #1529 — the default used to be carto-light/carto-dark by theme. CARTO now
  // requires an API key and returns HTTP 200 with "API KEY REQUIRED" burned
  // into the tile image, so every map in the product rendered watermarked and
  // nothing errored. OSM needs no key and is theme-independent; dark mode is
  // handled by a CSS filter on the tile pane instead.
  it("defaults to the keyless OSM tile layer", () => {
    render(<MapChart />);
    expect(L.tileLayer).toHaveBeenCalledWith(
      expect.stringContaining("tile.openstreetmap.org"),
      expect.objectContaining({
        attribution: expect.stringContaining("OpenStreetMap"),
      }),
    );
  });

  it("does not fall back to a keyed provider", () => {
    render(<MapChart />);
    const url = (L.tileLayer as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(url).not.toContain("cartocdn");
  });

  // A default map claiming "© CARTO" while serving OSM tiles is a licensing
  // statement, not a cosmetic one.
  it("attributes only the provider actually in use", () => {
    render(<MapChart />);
    const opts = (L.tileLayer as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as { attribution: string };
    expect(opts.attribution).toContain("OpenStreetMap");
    expect(opts.attribution).not.toContain("CARTO");
  });

  // #1685 — the CARTO presets are gone: both returned an "API KEY REQUIRED"
  // watermark burned into the PNG (#1529), so the product no longer knows
  // those keys. Anyone with a CARTO key types the full template instead.
  it.each(["carto-light", "carto-dark"])(
    "no longer expands %s into a cartocdn URL",
    (key) => {
      render(<MapChart tileLayer={key} />);
      const url = (L.tileLayer as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      expect(url).not.toContain("cartocdn");
    },
  );

  describe("bring-your-own tiles (#1685)", () => {
    const custom = "https://tiles.example.test/{z}/{x}/{y}.png";

    it("passes a custom template and its attribution through verbatim", () => {
      expect(resolveTileLayer(custom, "© Example Corp")).toEqual({
        url: custom,
        attribution: "© Example Corp",
      });
    });

    it("escapes HTML in a typed attribution so a creator cannot script a viewer's page", () => {
      // Leaflet sets the attribution as innerHTML; this string comes from a
      // text field any dashboard creator can fill.
      const hostile = '<img src=x onerror="alert(1)">';
      const credit = resolveTileLayer(custom, hostile)?.attribution;
      expect(credit).not.toContain("<");
      expect(credit).toContain("&lt;img");
    });

    it("does not credit OpenStreetMap for tiles that did not come from it", () => {
      // The old fallback attributed every custom server to OSM — a licensing
      // statement about someone else's tiles.
      expect(resolveTileLayer(custom)?.attribution).toBe("");
      expect(resolveTileLayer(custom, "")?.attribution).toBe("");
    });

    it("yields no tile layer for the none preset", () => {
      expect(resolveTileLayer("none")).toBeNull();
      expect(resolveTileLayer("none", "ignored")).toBeNull();
    });

    it.each([undefined, "", "  ", "osm", OSM_TILE_URL])(
      "resolves %j to OpenStreetMap with its attribution",
      (value) => {
        const tile = resolveTileLayer(value);
        expect(tile?.url).toBe(OSM_TILE_URL);
        expect(tile?.attribution).toContain("OpenStreetMap");
      },
    );

    it("keeps the OSM attribution when the attribution option is blank", () => {
      // The editor default is the OSM template next to an empty attribution
      // field; OSM tiles served without credit would break their terms.
      expect(resolveTileLayer(OSM_TILE_URL, "")?.attribution).toContain(
        "OpenStreetMap",
      );
    });

    it("lets a custom attribution override the OSM one", () => {
      expect(resolveTileLayer("osm", "mine")?.attribution).toBe("mine");
    });

    // A stray space is how a user "clears" the field; it must not drop the
    // credit OSM's terms require. Pins `attribution?.trim()`.
    it.each([" ", "  ", "\t"])(
      "keeps the OSM attribution when the attribution option is %j",
      (blank) => {
        expect(resolveTileLayer(OSM_TILE_URL, blank)?.attribution).toContain(
          "OpenStreetMap",
        );
        expect(resolveTileLayer("osm", blank)?.attribution).toContain(
          "OpenStreetMap",
        );
      },
    );

    it("trims a typed attribution", () => {
      expect(resolveTileLayer(custom, "  mine  ")?.attribution).toBe("mine");
    });

    // OSM's other official template has no {s}; the CustomTileServer story
    // and the docs both use it. The credit is a licensing statement about
    // the host, not about one literal.
    it.each([
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      "http://tile.openstreetmap.org/{z}/{x}/{y}.png",
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png?foo=1",
    ])("credits OpenStreetMap for its no-subdomain template %j", (url) => {
      const tile = resolveTileLayer(url);
      expect(tile?.url).toBe(url);
      expect(tile?.attribution).toContain("OpenStreetMap");
    });

    it("does not credit OpenStreetMap for a host that merely contains its name", () => {
      expect(
        resolveTileLayer("https://tile.openstreetmap.org.example.test/{z}/{x}/{y}.png")
          ?.attribution,
      ).toBe("");
    });

    // Leaflet's Util.template throws synchronously from addTo(map) on any
    // placeholder it was not handed — {apikey}, {accessToken}, {id} straight
    // from a provider's docs, or a {Z} typo. Inside the swap effect that
    // crash latched the ChartErrorBoundary for the rest of the editor session.
    describe("a placeholder Leaflet cannot fill", () => {
      const keyed =
        "https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey={apikey}";

      it.each([keyed, "https://tiles.example.test/{Z}/{x}/{y}.png"])(
        "resolves %j to no tile layer",
        (url) => {
          expect(resolveTileLayer(url)).toBeNull();
        },
      );

      it("renders the map without throwing and creates no tile layer", () => {
        expect(() =>
          render(
            <MapChart tileLayer={keyed} markers={[{ id: "1", lat: 1, lng: 2 }]} />,
          ),
        ).not.toThrow();
        expect(L.tileLayer).not.toHaveBeenCalled();
        expect(L.circleMarker).toHaveBeenCalledTimes(1);
      });

      it("removes the basemap while the template is broken and restores it once fixed", () => {
        vi.useFakeTimers();
        const { rerender } = render(<MapChart />);
        const layer = (L.tileLayer as unknown as ReturnType<typeof vi.fn>).mock
          .results[0].value;
        rerender(<MapChart tileLayer={keyed} />);
        expect(mockRemoveLayer).toHaveBeenCalledWith(layer);
        rerender(<MapChart tileLayer={custom} />);
        // A restore is a replacement, so it settles like any other.
        act(() => {
          vi.advanceTimersByTime(300);
        });
        expect(L.tileLayer).toHaveBeenLastCalledWith(custom, expect.anything());
      });
    });

    // The editor feeds every keystroke straight into the chart. Recreating the
    // layer per attribution character re-fetched every visible tile.
    it("updates the credit in place when only the attribution changes", () => {
      const { rerender } = render(
        <MapChart tileLayer={custom} attribution="one" />,
      );
      rerender(<MapChart tileLayer={custom} attribution="two" />);
      expect(L.tileLayer).toHaveBeenCalledTimes(1);
      expect(mockRemoveAttribution).toHaveBeenCalledWith("one");
      expect(mockAddAttribution).toHaveBeenCalledWith("two");
      const layer = (L.tileLayer as unknown as ReturnType<typeof vi.fn>).mock
        .results[0].value as { options: { attribution: string } };
      expect(layer.options.attribution).toBe("two");
    });

    it("lets the swap remove the credit the layer currently carries, not the one it was born with", () => {
      // Leaflet's layerremove hook reads getAttribution() at removal time;
      // if options.attribution were stale the old credit would linger.
      const { rerender } = render(
        <MapChart tileLayer={custom} attribution="one" />,
      );
      rerender(<MapChart tileLayer={custom} attribution="two" />);
      rerender(<MapChart tileLayer="none" attribution="two" />);
      expect(mockRemoveAttribution).not.toHaveBeenCalledWith("two");
    });

    // Typing a template character by character replaced the layer per
    // keystroke — a full viewport of tile requests for every prefix, first
    // as relative URLs against the app server, then as DNS lookups for
    // partial hostnames.
    it("settles rapid template changes into one replacement layer", () => {
      vi.useFakeTimers();
      const { rerender } = render(<MapChart tileLayer={custom} />);
      expect(L.tileLayer).toHaveBeenCalledTimes(1);
      const prefixes = [
        "https://a/{z}/{x}/{y}.png",
        "https://ab/{z}/{x}/{y}.png",
        "https://abc/{z}/{x}/{y}.png",
      ];
      for (const url of prefixes) rerender(<MapChart tileLayer={url} />);
      expect(L.tileLayer).toHaveBeenCalledTimes(1);
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(L.tileLayer).toHaveBeenCalledTimes(2);
      expect(L.tileLayer).toHaveBeenLastCalledWith(
        prefixes[2],
        expect.anything(),
      );
    });

    it("does not delay the first tile layer of a map", () => {
      // A dashboard full of maps must not paint 300 ms late; only a
      // replacement waits for the typing to stop.
      vi.useFakeTimers();
      render(<MapChart tileLayer={custom} />);
      expect(L.tileLayer).toHaveBeenCalledTimes(1);
    });

    it("uses the attribution current at settle time for a settled layer", () => {
      vi.useFakeTimers();
      const { rerender } = render(<MapChart tileLayer={custom} />);
      rerender(<MapChart tileLayer="https://b/{z}/{x}/{y}.png" />);
      rerender(
        <MapChart tileLayer="https://b/{z}/{x}/{y}.png" attribution="late" />,
      );
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(L.tileLayer).toHaveBeenLastCalledWith("https://b/{z}/{x}/{y}.png", {
        attribution: "late",
      });
    });

    it("drops a pending replacement on unmount", () => {
      vi.useFakeTimers();
      const { rerender, unmount } = render(<MapChart tileLayer={custom} />);
      rerender(<MapChart tileLayer="https://b/{z}/{x}/{y}.png" />);
      unmount();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(L.tileLayer).toHaveBeenCalledTimes(1);
    });

    // The dark-mode invert filter (#1529) is a CSS rule keyed on this
    // attribute; a tileset that is already dark must be able to opt out or
    // it comes out light in dark mode.
    describe("invertTilesInDarkMode", () => {
      it("marks the container for the dark-mode invert filter by default", () => {
        render(<MapChart />);
        expect(screen.getByTestId("map-chart")).toHaveAttribute(
          "data-invert-tiles",
        );
      });

      it("drops the mark when turned off", () => {
        render(<MapChart invertTilesInDarkMode={false} />);
        expect(screen.getByTestId("map-chart")).not.toHaveAttribute(
          "data-invert-tiles",
        );
      });
    });

    it("is what the editor's default option value resolves to", () => {
      // The option default lives in chart-options/map.ts as a literal; this
      // pins it to the preset so the two cannot drift apart.
      expect(getDefaultChartSettings("map").tileLayer).toBe(OSM_TILE_URL);
    });

    it("draws markers with no tile layer when tileLayer is none", () => {
      render(
        <MapChart tileLayer="none" markers={[{ id: "1", lat: 10, lng: 20 }]} />,
      );
      expect(L.tileLayer).not.toHaveBeenCalled();
      expect(L.circleMarker).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("map-chart")).toBeInTheDocument();
    });

    it("creates exactly one tile layer on mount", () => {
      // The init effect and the swap effect used to each add one, the first
      // being torn down a tick later — two tile requests' worth of churn.
      render(<MapChart />);
      expect(L.tileLayer).toHaveBeenCalledTimes(1);
      const layer = (L.tileLayer as unknown as ReturnType<typeof vi.fn>).mock
        .results[0].value;
      expect(mockRemoveLayer).not.toHaveBeenCalledWith(layer);
    });

    it("removes the basemap when tileLayer switches to none", () => {
      const { rerender } = render(<MapChart />);
      const layer = (L.tileLayer as unknown as ReturnType<typeof vi.fn>).mock
        .results[0].value;
      rerender(<MapChart tileLayer="none" />);
      expect(mockRemoveLayer).toHaveBeenCalledWith(layer);
      expect(L.tileLayer).toHaveBeenCalledTimes(1);
    });

    it("adds a basemap back when tileLayer leaves none", () => {
      const { rerender } = render(<MapChart tileLayer="none" />);
      expect(L.tileLayer).not.toHaveBeenCalled();
      rerender(<MapChart tileLayer={custom} attribution="mine" />);
      expect(L.tileLayer).toHaveBeenCalledWith(custom, { attribution: "mine" });
    });
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

  // Leaflet's zoom animation arms a bare `setTimeout(_onZoomTransitionEnd, 250)`
  // that `map.remove()` never cancels. If the map is unmounted mid-zoom, that
  // callback fires against a map whose `_mapPane` has been deleted and throws
  // "Cannot read properties of undefined (reading '_leaflet_pos')" — an
  // unhandled error that failed the whole Storybook browser run even though
  // every story passed. `_onZoomTransitionEnd` early-returns on a falsy
  // `_animatingZoom`, so clearing the flag before removal disarms it.
  describe("teardown during a zoom animation", () => {
    it("clears the pending zoom transition before removing the map", () => {
      const { unmount } = render(<MapChart />);
      const map = (L.map as unknown as ReturnType<typeof vi.fn>).mock.results[0]
        .value as { _animatingZoom?: boolean };
      map._animatingZoom = true;

      let animatingAtRemoval: boolean | undefined;
      mockRemove.mockImplementation(() => {
        animatingAtRemoval = map._animatingZoom;
      });
      unmount();

      expect(mockRemove).toHaveBeenCalled();
      expect(animatingAtRemoval).toBe(false);
    });
  });

  describe("fitting a container that has no size yet (#1398)", () => {
    const markers = [
      { id: "1", lat: 40, lng: -74 },
      { id: "2", lat: 51, lng: 0 },
    ];

    it("does not fit while the container measures 0x0", () => {
      // fitBounds on a 0x0 container resolves to maxZoom, and the map is left
      // zoomed so far in that nothing is in frame — a white rectangle.
      measured.width = 0;
      measured.height = 0;
      render(<MapChart markers={markers} autoFitBounds />);
      expect(mockFitBounds).not.toHaveBeenCalled();
    });

    it("fits once the container gains a size", () => {
      measured.width = 0;
      measured.height = 0;
      render(<MapChart markers={markers} autoFitBounds />);
      expect(mockFitBounds).not.toHaveBeenCalled();

      // Coming back to a dashboard page is exactly this transition.
      measured.width = 800;
      measured.height = 600;
      fireResize();
      expect(mockFitBounds).toHaveBeenCalledTimes(1);
    });

    it("does not re-fit on a later resize, leaving the user's pan alone", () => {
      render(<MapChart markers={markers} autoFitBounds />);
      expect(mockFitBounds).toHaveBeenCalledTimes(1);

      fireResize();
      expect(mockFitBounds).toHaveBeenCalledTimes(1);
    });

    it("does not fit from a resize when auto-fit is off", () => {
      measured.width = 0;
      measured.height = 0;
      render(<MapChart markers={markers} autoFitBounds={false} />);
      measured.width = 800;
      measured.height = 600;
      fireResize();
      expect(mockFitBounds).not.toHaveBeenCalled();
    });

    it("makes Leaflet re-measure before fitting", () => {
      // getBoundsZoom works off the size Leaflet cached at construction. A map
      // built before layout settled therefore fits against 0x0 and lands on
      // maxZoom, however wide the DOM says the container now is.
      render(<MapChart markers={markers} autoFitBounds />);

      const invalidateOrder = mockInvalidateSize.mock.invocationCallOrder[0];
      const fitOrder = mockFitBounds.mock.invocationCallOrder[0];
      expect(invalidateOrder).toBeLessThan(fitOrder);
    });

    it("lets a world-spanning fit reach zoom 0 in a narrow card", () => {
      // The world is 1024px wide at zoom 2, so a 390px card cannot contain
      // global markers above it — a minZoom of 2 made the second half of
      // #1398 (only Europe visible) impossible to fix any other way.
      render(<MapChart markers={markers} />);
      expect(L.map).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ minZoom: 0 }),
      );
    });
  });
});
