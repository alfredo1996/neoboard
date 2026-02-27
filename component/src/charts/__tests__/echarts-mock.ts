/**
 * Shared ECharts mock setup for chart unit tests.
 *
 * Import `mockSetOption` to assert on the options passed to ECharts,
 * and call `setupEChartsMocks()` in a `vi.mock(...)` hoisted call — or
 * simply import the side-effect mocks from this module which Vitest will
 * hoist automatically when vi.mock factory functions reference it.
 *
 * Usage in a test file:
 *
 *   import { mockSetOption, registerEChartsMocks } from "./echarts-mock";
 *   registerEChartsMocks();
 */
import { vi } from "vitest";

export const mockSetOption = vi.fn();

/**
 * Register all vi.mock calls needed by ECharts-based chart tests.
 * Call this at the top level of any chart test file (outside describe blocks)
 * so that Vitest's hoisting picks it up correctly.
 *
 * NOTE: Because Vitest hoists vi.mock() calls, this function must be called
 * at module scope — not inside beforeEach or describe.
 */
export function registerEChartsMocks() {
  vi.mock("echarts/core", () => {
    const use = vi.fn();
    const init = vi.fn(() => ({
      setOption: mockSetOption,
      resize: vi.fn(),
      dispose: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      showLoading: vi.fn(),
      hideLoading: vi.fn(),
    }));
    return { use, init, default: { use, init } };
  });

  vi.mock("echarts/charts", () => ({
    BarChart: vi.fn(),
    LineChart: vi.fn(),
    PieChart: vi.fn(),
    GraphChart: vi.fn(),
  }));

  vi.mock("echarts/components", () => ({
    TitleComponent: vi.fn(),
    TooltipComponent: vi.fn(),
    LegendComponent: vi.fn(),
    GridComponent: vi.fn(),
    DataZoomComponent: vi.fn(),
  }));

  vi.mock("echarts/renderers", () => ({
    CanvasRenderer: vi.fn(),
  }));
}
