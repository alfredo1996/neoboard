import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("hides drag handle visually when not draggable", () => {
    render(<WidgetCard title="Sales">Content</WidgetCard>);
    const handle = screen.getByText("Drag to reorder").closest("button")!;
    expect(handle.className).toContain("invisible");
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

  // ── disabled action ───────────────────────────────────────────────────────

  it("renders a disabled action item with disabled attribute", async () => {
    const user = userEvent.setup();
    const actions = [
      { label: "Save to Lab", onClick: vi.fn(), disabled: true },
    ];
    render(<WidgetCard title="Sales" actions={actions}>Content</WidgetCard>);
    await user.click(screen.getByRole("button", { name: "Widget actions" }));
    const item = screen.getByRole("menuitem", { name: "Save to Lab" });
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute("data-disabled");
  });

  it("does not call onClick when a disabled action is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const actions = [{ label: "Save to Lab", onClick, disabled: true }];
    render(<WidgetCard title="Sales" actions={actions}>Content</WidgetCard>);
    await user.click(screen.getByRole("button", { name: "Widget actions" }));
    const item = screen.getByRole("menuitem", { name: "Save to Lab" });
    await user.click(item);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies opacity and cursor-not-allowed class to disabled action", async () => {
    const user = userEvent.setup();
    const actions = [{ label: "Locked", onClick: vi.fn(), disabled: true }];
    render(<WidgetCard title="Sales" actions={actions}>Content</WidgetCard>);
    await user.click(screen.getByRole("button", { name: "Widget actions" }));
    const item = screen.getByRole("menuitem", { name: "Locked" });
    expect(item.className).toContain("opacity-50");
    expect(item.className).toContain("cursor-not-allowed");
  });

  it("calls onClick normally for a non-disabled action", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const actions = [{ label: "Edit", onClick }];
    render(<WidgetCard title="Sales" actions={actions}>Content</WidgetCard>);
    await user.click(screen.getByRole("button", { name: "Widget actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
