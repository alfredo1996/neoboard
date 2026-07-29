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

// ─── Breakpoint column parity (#1375) ────────────────────────────────────────
//
// A single layout is stored per page, but ResponsiveGridLayout was given four
// DIFFERENT column counts (lg:12, md:10, sm:6, xs:4) for that one layout. Below
// `lg` the grid clamps every item into the narrower column count, and
// onDragStop hands that clamped layout back — which then gets persisted as THE
// layout. The authored 12-column arrangement is overwritten by its own squashed
// projection, and since nothing ever widens it back, every save on a narrow
// window ratchets it further toward one column.
//
// The container is the viewport minus the sidebar, so a 1280px window is
// already below the lg:1200 breakpoint — this fires on ordinary laptops, which
// is why it read as intermittent.
//
// Fix: one column count everywhere. If you store one layout, you must author at
// one column count; the grid scales instead of reflowing, so a drag can never
// return fewer columns than it was given.

describe("DashboardGrid — breakpoint column parity (#1375)", () => {
  it("uses the same column count at every breakpoint", () => {
    render(
      <DashboardGrid layout={layout}>
        <div key="a">A</div>
      </DashboardGrid>,
    );
    // Exact mapping, not "all values equal": `{ lg: 12 }` alone would satisfy a
    // set-size check while leaving md/sm/xs unmapped, which is the very bug.
    expect(capturedProps.cols).toEqual({ lg: 12, md: 12, sm: 12, xs: 12 });
  });

  it("honours a custom cols at every breakpoint, not just lg", () => {
    render(
      <DashboardGrid layout={layout} cols={24}>
        <div key="a">A</div>
      </DashboardGrid>,
    );
    expect(capturedProps.cols).toEqual({ lg: 24, md: 24, sm: 24, xs: 24 });
  });

  it("keeps the authored column count at a narrow container width", () => {
    // 1000px is inside the md range (996–1199) — the width a 1280px window
    // actually produces once the sidebar is subtracted.
    mockWidth = 1000;
    render(
      <DashboardGrid layout={layout}>
        <div key="a">A</div>
      </DashboardGrid>,
    );
    // Pin the measured width too, so the case cannot silently stop exercising
    // the sub-lg path if the mock changes.
    expect(capturedProps.width).toBe(1000);
    expect(capturedProps.cols).toEqual({ lg: 12, md: 12, sm: 12, xs: 12 });
  });

  it("still hands the same layout to every breakpoint", () => {
    render(
      <DashboardGrid layout={layout}>
        <div key="a">A</div>
      </DashboardGrid>,
    );
    const layouts = capturedProps.layouts as Record<string, unknown>;
    for (const bp of ["lg", "md", "sm", "xs"]) {
      expect(layouts[bp]).toBe(layout);
    }
  });
});
