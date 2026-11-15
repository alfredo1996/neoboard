import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { graphPlugin } from "../graph";

vi.mock("@/components/graph-exploration-wrapper", () => ({
  GraphExplorationWrapper: () => <div data-testid="graph-exploration" />,
}));
vi.mock("@/components/lazy-graph-chart", () => ({
  GraphChart: () => <div data-testid="plain-graph" />,
}));

const Graph = graphPlugin.component;
const props = {
  data: { nodes: [], edges: [] },
  connectionId: "c1",
  widgetId: "w1--fullscreen",
};

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// #1509: the expanded graph waits out the dialog's zoom-in (NVL measures the
// canvas at mount) but shows no skeleton while it does; a tile mounts as before.
describe("graph plugin mount", () => {
  it("an expanded graph shows no skeleton, then mounts after the dialog settles", () => {
    render(<Graph {...props} autoFit />);
    expect(screen.queryByTestId("graph-skeleton")).toBeNull();
    expect(screen.queryByTestId("graph-exploration")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByTestId("graph-exploration")).toBeDefined();
  });

  it("a tile still waits for the viewport behind its skeleton", () => {
    render(<Graph {...props} />);
    expect(screen.getByTestId("graph-skeleton")).toBeDefined();
  });
});
