import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WidgetCard } from "../widget-card";

describe("WidgetCard", () => {
  it("renders children", () => {
    render(<WidgetCard>Content here</WidgetCard>);
    expect(screen.getByText("Content here")).toBeInTheDocument();
  });

  it("renders title", () => {
    render(<WidgetCard title="Sales">Content</WidgetCard>);
    expect(screen.getByText("Sales")).toBeInTheDocument();
  });

  it("renders subtitle", () => {
    render(<WidgetCard title="Sales" subtitle="Last 30 days">Content</WidgetCard>);
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
  });

  it("shows drag handle when draggable", () => {
    render(<WidgetCard draggable title="Sales">Content</WidgetCard>);
    expect(screen.getByText("Drag to reorder")).toBeInTheDocument();
  });

  it("does not show drag handle by default", () => {
    render(<WidgetCard title="Sales">Content</WidgetCard>);
    expect(screen.queryByText("Drag to reorder")).not.toBeInTheDocument();
  });

  it("renders action menu with actions", () => {
    const actions = [
      { label: "Edit", onClick: vi.fn() },
      { label: "Delete", onClick: vi.fn(), destructive: true },
    ];
    render(<WidgetCard title="Sales" actions={actions}>Content</WidgetCard>);
    expect(screen.getByRole("button", { name: "Widget actions" })).toBeInTheDocument();
  });

  it("calls onDragHandleMouseDown when drag handle is pressed", () => {
    const onMouseDown = vi.fn();
    render(
      <WidgetCard draggable title="Sales" onDragHandleMouseDown={onMouseDown}>
        Content
      </WidgetCard>
    );
    fireEvent.mouseDown(screen.getByText("Drag to reorder").closest("button")!);
    expect(onMouseDown).toHaveBeenCalledOnce();
  });

  it("does not render header when no title, actions, or draggable", () => {
    const { container } = render(<WidgetCard>Content only</WidgetCard>);
    // CardHeader should not be present
    expect(container.querySelector("[class*='pb-2']")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<WidgetCard className="my-widget">Content</WidgetCard>);
    expect(container.firstChild).toHaveClass("my-widget");
  });

  it("renders headerExtra content in the header", () => {
    render(
      <WidgetCard title="Sales" headerExtra={<button>Fullscreen</button>}>
        Content
      </WidgetCard>
    );
    expect(screen.getByText("Fullscreen")).toBeInTheDocument();
  });

  it("renders header when only headerExtra is provided", () => {
    render(
      <WidgetCard headerExtra={<span data-testid="extra">Extra</span>}>
        Content
      </WidgetCard>
    );
    expect(screen.getByTestId("extra")).toBeInTheDocument();
  });

  it("renders headerExtra alongside actions", () => {
    const actions = [{ label: "Remove", onClick: vi.fn(), destructive: true }];
    render(
      <WidgetCard
        title="Sales"
        actions={actions}
        headerExtra={<button>Expand</button>}
      >
        Content
      </WidgetCard>
    );
    expect(screen.getByText("Expand")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Widget actions" })).toBeInTheDocument();
  });
});
