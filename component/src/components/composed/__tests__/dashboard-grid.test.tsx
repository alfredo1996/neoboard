import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DashboardGrid } from "../dashboard-grid";

const layout = [
  { i: "a", x: 0, y: 0, w: 6, h: 2 },
  { i: "b", x: 6, y: 0, w: 6, h: 2 },
];

describe("DashboardGrid", () => {
  it("renders children", () => {
    render(
      <DashboardGrid layout={layout}>
        <div key="a">Widget A</div>
        <div key="b">Widget B</div>
      </DashboardGrid>
    );
    expect(screen.getByText("Widget A")).toBeInTheDocument();
    expect(screen.getByText("Widget B")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <DashboardGrid layout={layout} className="my-grid">
        <div key="a">A</div>
      </DashboardGrid>
    );
    expect(container.firstChild).toHaveClass("my-grid");
  });

  it("renders with drag disabled", () => {
    render(
      <DashboardGrid layout={layout} isDraggable={false}>
        <div key="a">A</div>
      </DashboardGrid>
    );
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders with resize disabled", () => {
    render(
      <DashboardGrid layout={layout} isResizable={false}>
        <div key="a">A</div>
      </DashboardGrid>
    );
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
