import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LineChart } from "../line-chart";

/**
 * #1562 — LineChart latched a memo-read prop.
 *
 * The option memo read a prop but did
 * not declare it as a dependency, so changing the legend position alone did
 * nothing until some unrelated dependency changed identity — at which point
 * the legend jumped to a position the user had chosen some time earlier.
 *
 * This is #1546 again, in the other chart. Fixing bar-chart made it visible:
 * that fix added both `width` and the legend prop, and line-chart already
 * declared `width` — so the legend prop was the one left behind. #1546's own
 * write-up cited line-chart as the correct example because it declares
 * `width`. It does. It just did not declare this.
 *
 * Found by react-hooks/exhaustive-deps the first time ESLint ran on
 * component/ (#1547).
 */

const mockSetOption = vi.fn();

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
  const registerTheme = vi.fn();
  return { use, init, registerTheme, default: { use, init, registerTheme } };
});

const data = [
  { x: "Jan", sales: 10, returns: 2 },
  { x: "Feb", sales: 12, returns: 3 },
  { x: "Mar", sales: 9, returns: 1 },
];

/** The option handed to ECharts most recently — the settled state. */
function latestOptions() {
  const calls = mockSetOption.mock.calls;
  return calls[calls.length - 1][0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LineChart memo dependencies (#1562)", () => {
  // `legendPosition` was the original vehicle for this guard. It was deleted
  // in #1592 (the legend is bottom-only now), so the guard rides on showLegend
  // — what matters is that a lone prop change reaches the option memo, not
  // which prop it is.
  it("applies a showLegend change on its own", () => {
    const { rerender } = render(<LineChart data={data} showLegend />);
    expect(latestOptions().legend).toBeDefined();

    // Only this prop changes. Nothing else the user can see has changed, so
    // nothing else may be what makes it take effect.
    rerender(<LineChart data={data} showLegend={false} />);
    expect(latestOptions().legend).toBeUndefined();
  });

  it("does not rebuild the series when only showLegend changes", () => {
    const { rerender } = render(<LineChart data={data} showLegend />);
    const before = latestOptions();
    rerender(<LineChart data={data} showLegend={false} />);
    const after = latestOptions();
    expect(after.series.map((s: { name: string }) => s.name)).toEqual(
      before.series.map((s: { name: string }) => s.name),
    );
  });
});
