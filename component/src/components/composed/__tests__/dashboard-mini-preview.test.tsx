import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DashboardMiniPreview, type MiniPreviewWidget } from "../dashboard-mini-preview";

const sampleWidgets: MiniPreviewWidget[] = [
  { x: 0, y: 0, w: 6, h: 2, chartType: "bar" },
  { x: 6, y: 0, w: 6, h: 2, chartType: "line" },
  { x: 0, y: 2, w: 4, h: 2, chartType: "pie" },
  { x: 4, y: 2, w: 8, h: 2, chartType: "table" },
];

describe("DashboardMiniPreview", () => {
  it("renders empty state when no widgets", () => {
    render(<DashboardMiniPreview widgets={[]} />);
    expect(screen.getByText("No widgets")).toBeInTheDocument();
  });

  it("renders correct number of blocks", () => {
    const { container } = render(
      <DashboardMiniPreview widgets={sampleWidgets} />
    );
    const blocks = container.querySelectorAll(".rounded-sm");
    expect(blocks).toHaveLength(4);
  });

  it("applies correct grid positioning via inline styles", () => {
    const { container } = render(
      <DashboardMiniPreview widgets={[{ x: 2, y: 1, w: 4, h: 3, chartType: "bar" }]} />
    );
    const block = container.querySelector(".rounded-sm") as HTMLElement;
    expect(block.style.gridColumn).toBe("3 / span 4");
    expect(block.style.gridRow).toBe("2 / span 3");
  });

  it("applies chart-type color classes", () => {
    const { container } = render(
      <DashboardMiniPreview
        widgets={[
          { x: 0, y: 0, w: 6, h: 2, chartType: "bar" },
          { x: 6, y: 0, w: 6, h: 2, chartType: "pie" },
        ]}
      />
    );
    const blocks = container.querySelectorAll(".rounded-sm");
    expect(blocks[0]).toHaveClass("bg-blue-400/40");
    expect(blocks[1]).toHaveClass("bg-amber-400/40");
  });

  it("applies fallback color for unknown chart type", () => {
    const { container } = render(
      <DashboardMiniPreview
        widgets={[{ x: 0, y: 0, w: 6, h: 2, chartType: "custom-unknown" }]}
      />
    );
    const block = container.querySelector(".rounded-sm");
    expect(block).toHaveClass("bg-muted");
  });

  it("applies className prop", () => {
    const { container } = render(
      <DashboardMiniPreview widgets={[]} className="my-custom-class" />
    );
    expect(container.firstChild).toHaveClass("my-custom-class");
  });

  it("renders grid container with 12 columns", () => {
    const { container } = render(
      <DashboardMiniPreview widgets={sampleWidgets} />
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(12, 1fr)");
  });
});
