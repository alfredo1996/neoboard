import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DashboardGrid } from "../dashboard-grid";

// Control the measured container width and capture the props DashboardGrid
// passes to ResponsiveGridLayout, without rendering the real (heavy,
// ResizeObserver-driven) grid.
let mockWidth = 1300;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- captured RGL props
let capturedProps: any = {};

vi.mock("react-grid-layout", () => ({
  useContainerWidth: () => ({
    width: mockWidth,
    mounted: true,
    containerRef: { current: null },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub
  ResponsiveGridLayout: (props: any) => {
    capturedProps = props;
    return <div data-testid="rgl">{props.children}</div>;
  },
  verticalCompactor: { type: "vertical" },
  horizontalCompactor: { type: "horizontal" },
  noCompactor: { type: "none" },
}));

const layout = [
  { i: "a", x: 0, y: 0, w: 6, h: 2 },
  { i: "b", x: 6, y: 0, w: 6, h: 2 },
];

beforeEach(() => {
  mockWidth = 1300;
  capturedProps = {};
});

describe("DashboardGrid", () => {
  it("renders children", () => {
    render(
      <DashboardGrid layout={layout}>
        <div key="a">Widget A</div>
        <div key="b">Widget B</div>
      </DashboardGrid>,
    );
    expect(screen.getByText("Widget A")).toBeInTheDocument();
    expect(screen.getByText("Widget B")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <DashboardGrid layout={layout} className="my-grid">
        <div key="a">A</div>
      </DashboardGrid>,
    );
    expect(container.firstChild).toHaveClass("my-grid");
  });

  it("renders with drag disabled", () => {
    render(
      <DashboardGrid layout={layout} isDraggable={false}>
        <div key="a">A</div>
      </DashboardGrid>,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders with resize disabled", () => {
    render(
      <DashboardGrid layout={layout} isResizable={false}>
        <div key="a">A</div>
      </DashboardGrid>,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});

// The single stored layout is fanned to every breakpoint, so a responsive
// reflow (window resize) must never persist — only real drag/resize should.
describe("DashboardGrid — persist only on user drag/resize", () => {
  it("forwards onDragStop to onLayoutChange", () => {
    const onLayoutChange = vi.fn();
    render(
      <DashboardGrid layout={layout} onLayoutChange={onLayoutChange}>
        <div key="a">A</div>
      </DashboardGrid>,
    );
    const next = [{ i: "a", x: 1, y: 0, w: 6, h: 2 }];
    capturedProps.onDragStop(next);
    expect(onLayoutChange).toHaveBeenCalledWith(next);
  });

  it("forwards onResizeStop to onLayoutChange", () => {
    const onLayoutChange = vi.fn();
    render(
      <DashboardGrid layout={layout} onLayoutChange={onLayoutChange}>
        <div key="a">A</div>
      </DashboardGrid>,
    );
    const next = [{ i: "a", x: 0, y: 0, w: 8, h: 3 }];
    capturedProps.onResizeStop(next);
    expect(onLayoutChange).toHaveBeenCalledWith(next);
  });

  it("does NOT wire onLayoutChange (reflow must not persist)", () => {
    const onLayoutChange = vi.fn();
    render(
      <DashboardGrid layout={layout} onLayoutChange={onLayoutChange}>
        <div key="a">A</div>
      </DashboardGrid>,
    );
    // The wrapper does not forward the grid's onLayoutChange (mount/reflow),
    // so a window-resize reflow can never dirty or clobber the saved layout.
    expect(capturedProps.onLayoutChange).toBeUndefined();
  });

  it("keeps drag/resize enabled at any width", () => {
    mockWidth = 800;
    render(
      <DashboardGrid layout={layout} isDraggable isResizable>
        <div key="a">A</div>
      </DashboardGrid>,
    );
    expect(capturedProps.dragConfig.enabled).toBe(true);
    expect(capturedProps.resizeConfig.enabled).toBe(true);
  });
});
