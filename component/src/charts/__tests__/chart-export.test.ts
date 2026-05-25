import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => {
  const mockGetInstanceByDom = vi.fn();
  const mockOffscreenSetOption = vi.fn();
  const mockOffscreenDispose = vi.fn();
  const mockGetOption = vi.fn(() => ({ title: { text: "Test" } }));
  const mockGetDataURL = vi.fn(() => "data:image/png;base64,STUB");
  const state: { initSideEffect: ((el: HTMLElement) => void) | null } = {
    initSideEffect: (offscreen) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      offscreen.appendChild(svg);
    },
  };
  return {
    mockGetInstanceByDom,
    mockOffscreenSetOption,
    mockOffscreenDispose,
    mockGetOption,
    mockGetDataURL,
    state,
  };
});

vi.mock("echarts/core", () => {
  const use = vi.fn();
  const registerTheme = vi.fn();
  const init = vi.fn((offscreen: HTMLElement) => {
    if (h.state.initSideEffect) h.state.initSideEffect(offscreen);
    return {
      setOption: h.mockOffscreenSetOption,
      dispose: h.mockOffscreenDispose,
    };
  });
  return {
    use,
    init,
    registerTheme,
    getInstanceByDom: h.mockGetInstanceByDom,
    default: {
      use,
      init,
      registerTheme,
      getInstanceByDom: h.mockGetInstanceByDom,
    },
  };
});

vi.mock("echarts/components", () => ({
  TitleComponent: vi.fn(),
  TooltipComponent: vi.fn(),
  LegendComponent: vi.fn(),
  GridComponent: vi.fn(),
  DataZoomComponent: vi.fn(),
  AriaComponent: vi.fn(),
  RadarComponent: vi.fn(),
  MarkLineComponent: vi.fn(),
  GraphicComponent: vi.fn(),
}));

import { exportChartToSvg, exportChartToPng } from "../base-chart";

function makeVisibleChartStub(width = 400, height = 300) {
  const dom = document.createElement("div");
  vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  return {
    getOption: h.mockGetOption,
    getDom: () => dom,
    getDataURL: h.mockGetDataURL,
  };
}

describe("exportChartToSvg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.mockOffscreenSetOption.mockReset();
    h.mockOffscreenDispose.mockReset();
    h.state.initSideEffect = (offscreen) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      offscreen.appendChild(svg);
    };
    h.mockGetOption.mockReturnValue({ title: { text: "Test" } });
  });

  afterEach(() => {
    document
      .querySelectorAll('div[style*="-9999px"]')
      .forEach((el) => el.remove());
  });

  it("returns SVG string and disposes offscreen instance on success", () => {
    const container = document.createElement("div");
    h.mockGetInstanceByDom.mockReturnValue(makeVisibleChartStub());

    const result = exportChartToSvg(container);

    expect(typeof result).toBe("string");
    expect(result).toContain("<svg");
    expect(h.mockOffscreenDispose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('div[style*="-9999px"]')).toBeNull();
  });

  it("returns null when no chart instance is found", () => {
    const container = document.createElement("div");
    h.mockGetInstanceByDom.mockReturnValue(null);

    const result = exportChartToSvg(container);

    expect(result).toBeNull();
    expect(h.mockOffscreenDispose).not.toHaveBeenCalled();
  });

  it("disposes offscreen instance and removes DOM when setOption throws", () => {
    const container = document.createElement("div");
    h.mockGetInstanceByDom.mockReturnValue(makeVisibleChartStub());
    h.mockOffscreenSetOption.mockImplementation(() => {
      throw new Error("setOption boom");
    });

    expect(() => exportChartToSvg(container)).toThrow("setOption boom");
    expect(h.mockOffscreenDispose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('div[style*="-9999px"]')).toBeNull();
  });

  it("returns null and disposes when no svg element is rendered", () => {
    const container = document.createElement("div");
    h.mockGetInstanceByDom.mockReturnValue(makeVisibleChartStub());
    h.state.initSideEffect = null;

    const result = exportChartToSvg(container);

    expect(result).toBeNull();
    expect(h.mockOffscreenDispose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('div[style*="-9999px"]')).toBeNull();
  });

  it("rounds fractional dimensions before passing to echarts.init", async () => {
    const container = document.createElement("div");
    h.mockGetInstanceByDom.mockReturnValue(makeVisibleChartStub(403.7, 299.4));

    exportChartToSvg(container);

    const core = await import("echarts/core");
    const initCall = (core.init as ReturnType<typeof vi.fn>).mock.calls[0];
    const initOpts = initCall[2] as { width: number; height: number };
    expect(initOpts.width).toBe(404);
    expect(initOpts.height).toBe(299);
    expect(Number.isInteger(initOpts.width)).toBe(true);
    expect(Number.isInteger(initOpts.height)).toBe(true);
  });
});

describe("exportChartToPng", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.mockGetDataURL.mockReset();
    h.mockGetDataURL.mockReturnValue("data:image/png;base64,STUB");
    document.documentElement.classList.remove("dark");
  });

  it("returns a PNG data URL with light background in light mode", () => {
    const container = document.createElement("div");
    h.mockGetInstanceByDom.mockReturnValue(makeVisibleChartStub());

    const result = exportChartToPng(container);

    expect(result).toBe("data:image/png;base64,STUB");
    expect(h.mockGetDataURL).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "png",
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      }),
    );
  });

  it("uses dark background when dark mode is active", () => {
    document.documentElement.classList.add("dark");
    const container = document.createElement("div");
    h.mockGetInstanceByDom.mockReturnValue(makeVisibleChartStub());

    exportChartToPng(container);

    expect(h.mockGetDataURL).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundColor: "#0a0f1e" }),
    );
  });

  it("returns null when no chart instance is found", () => {
    const container = document.createElement("div");
    h.mockGetInstanceByDom.mockReturnValue(null);

    const result = exportChartToPng(container);

    expect(result).toBeNull();
    expect(h.mockGetDataURL).not.toHaveBeenCalled();
  });
});
