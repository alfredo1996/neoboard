import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { BarChart } from "../bar-chart";

/**
 * #1546 — the bar chart latched a stale container width.
 *
 * `bar-chart.tsx` reads `width` (from `useContainerSize`) inside its option
 * memo but omitted it from that memo's dependency array. `useContainerSize`
 * starts at `{width: 0}` and only measures in its callback ref, so render 1
 * always has `width === 0` — and `buildCategoryAxisLabel` treats a falsy
 * `containerWidth` as "unknown", falling through to a *different* heuristic
 * (category count) than the one it uses when the width is known
 * (pixels-per-label). The two disagree at most sizes.
 *
 * So the chart mounted painting the count-based rotation and latched it: the
 * real width, arriving one commit later, could not dislodge it because the
 * only width-derived deps that WERE declared (`compact`, `hideLegend`) are
 * both guarded by `width > 0` and are therefore `false` at 0px and `false` at
 * 561px alike.
 *
 * The latch broke on the next change to any *other* dep — and `data` changes
 * identity on every keystroke in the widget editor, because `card-container`
 * recomputes the transform in its render body with no memo. Typing in the
 * query editor was what made the axis visibly snap from one angle to the
 * other, which is how the bug was reported.
 *
 * The two heuristics are picked so they disagree here: at 561px with 10
 * categories, pixels-per-label is 56.1 (→ 45°) while the count fallback for
 * `>= 8` categories is 30° — so a latched width shows up as a 30 where a 45
 * belongs.
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

const CONTAINER_WIDTH = 561;
const WIDTH_BASED_ROTATION = 45; // 561 / 10 = 56.1 px per label

/** 10 categories — enough to make the two heuristics disagree. */
function makeData() {
  return Array.from({ length: 10 }, (_, i) => ({
    label: `Category ${i}`,
    value: (i + 1) * 10,
  }));
}

/** The option handed to ECharts most recently — i.e. the settled state. */
function latestOptions() {
  const calls = mockSetOption.mock.calls;
  return calls[calls.length - 1][0];
}

const original = {
  width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
  height: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  ),
};

// jsdom reports 0 for every layout box, which is exactly the width the bug
// latches onto — so it has to be stubbed for the measured branch to run at all.
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: CONTAINER_WIDTH,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 300,
  });
});

afterAll(() => {
  if (original.width)
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", original.width);
  if (original.height)
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetHeight",
      original.height,
    );
});

describe("BarChart container width (#1546)", () => {
  it("settles on the width-based rotation, not the category-count fallback", () => {
    render(<BarChart data={makeData()} />);
    expect(latestOptions().xAxis.axisLabel.rotate).toBe(WIDTH_BASED_ROTATION);
  });

  it("does not change the axis rotation when only the data identity changes", () => {
    const { rerender } = render(<BarChart data={makeData()} />);
    const settled = latestOptions().xAxis.axisLabel.rotate;

    // Same content, new array identity — what every keystroke in the widget
    // editor produces upstream. Nothing the user can see has changed, so
    // nothing about the axis may change either.
    rerender(<BarChart data={makeData()} />);

    expect(latestOptions().xAxis.axisLabel.rotate).toBe(settled);
  });

  // The same latch, on the second dependency the linter flagged. Changing
  // only the legend position must take effect on its own, without waiting for
  // an unrelated dep to churn.
  it("applies a legendPosition change on its own", () => {
    const data = makeData();
    const { rerender } = render(
      <BarChart data={data} showLegend legendPosition="bottom" />,
    );
    expect(latestOptions().legend.bottom).toBeDefined();

    rerender(<BarChart data={data} showLegend legendPosition="top" />);
    expect(latestOptions().legend.top).toBeDefined();
    expect(latestOptions().legend.bottom).toBeUndefined();
  });
});
