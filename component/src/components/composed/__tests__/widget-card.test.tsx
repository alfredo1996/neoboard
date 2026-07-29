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

  it("reserves the subtitle line when there is no subtitle (#1246)", () => {
    // Two widgets side by side must start their content at the same height.
    // Without a reserved line, a card with a subtitle pushes its chart down
    // relative to its neighbour and the row visibly fails to align.
    const { container } = render(
      <WidgetCard title="Sales">Content</WidgetCard>,
    );
    const placeholder = container.querySelector("[data-subtitle-placeholder]");
    expect(placeholder).toBeInTheDocument();
    // Reserved space must be invisible to assistive tech — it carries no meaning.
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
    expect(placeholder?.textContent).toBe("");
  });

  it("does not render a placeholder when a subtitle is present (#1246)", () => {
    const { container } = render(
      <WidgetCard title="Sales" subtitle="Last 30 days">
        Content
      </WidgetCard>,
    );
    expect(
      container.querySelector("[data-subtitle-placeholder]"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
  });

  it("reserves no subtitle line when the card has no title either (#1246)", () => {
    // A chrome-less card (no title, no subtitle) should not grow a phantom
    // header line — the reservation exists to align titled cards with each other.
    const { container } = render(<WidgetCard>Content</WidgetCard>);
    expect(
      container.querySelector("[data-subtitle-placeholder]"),
    ).not.toBeInTheDocument();
  });

  it("renders subtitle", () => {
    render(
      <WidgetCard title="Sales" subtitle="Last 30 days">
        Content
      </WidgetCard>,
    );
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
  });

  it("shows drag handle when draggable", () => {
    render(
      <WidgetCard draggable title="Sales">
        Content
      </WidgetCard>,
    );
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
    render(
      <WidgetCard title="Sales" actions={actions}>
        Content
      </WidgetCard>,
    );
    expect(
      screen.getByRole("button", { name: "Widget actions" }),
    ).toBeInTheDocument();
  });

  it("calls onDragHandleMouseDown when drag handle is pressed", () => {
    const onMouseDown = vi.fn();
    render(
      <WidgetCard draggable title="Sales" onDragHandleMouseDown={onMouseDown}>
        Content
      </WidgetCard>,
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
    const { container } = render(
      <WidgetCard className="my-widget">Content</WidgetCard>,
    );
    expect(container.firstChild).toHaveClass("my-widget");
  });

  it("renders headerExtra content in the header", () => {
    render(
      <WidgetCard title="Sales" headerExtra={<button>Fullscreen</button>}>
        Content
      </WidgetCard>,
    );
    expect(screen.getByText("Fullscreen")).toBeInTheDocument();
  });

  it("renders header when only headerExtra is provided", () => {
    render(
      <WidgetCard headerExtra={<span data-testid="extra">Extra</span>}>
        Content
      </WidgetCard>,
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
      </WidgetCard>,
    );
    expect(screen.getByText("Expand")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Widget actions" }),
    ).toBeInTheDocument();
  });

  // ── disabled action ───────────────────────────────────────────────────────

  it("renders a disabled action item with disabled attribute", async () => {
    const user = userEvent.setup();
    const actions = [
      { label: "Save to Lab", onClick: vi.fn(), disabled: true },
    ];
    render(
      <WidgetCard title="Sales" actions={actions}>
        Content
      </WidgetCard>,
    );
    await user.click(screen.getByRole("button", { name: "Widget actions" }));
    const item = screen.getByRole("menuitem", { name: "Save to Lab" });
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute("data-disabled");
  });

  it("does not call onClick when a disabled action is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const actions = [{ label: "Save to Lab", onClick, disabled: true }];
    render(
      <WidgetCard title="Sales" actions={actions}>
        Content
      </WidgetCard>,
    );
    await user.click(screen.getByRole("button", { name: "Widget actions" }));
    const item = screen.getByRole("menuitem", { name: "Save to Lab" });
    await user.click(item);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies opacity and cursor-not-allowed class to disabled action", async () => {
    const user = userEvent.setup();
    const actions = [{ label: "Locked", onClick: vi.fn(), disabled: true }];
    render(
      <WidgetCard title="Sales" actions={actions}>
        Content
      </WidgetCard>,
    );
    await user.click(screen.getByRole("button", { name: "Widget actions" }));
    const item = screen.getByRole("menuitem", { name: "Locked" });
    expect(item.className).toContain("opacity-50");
    expect(item.className).toContain("cursor-not-allowed");
  });

  it("calls onClick normally for a non-disabled action", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const actions = [{ label: "Edit", onClick }];
    render(
      <WidgetCard title="Sales" actions={actions}>
        Content
      </WidgetCard>,
    );
    await user.click(screen.getByRole("button", { name: "Widget actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  // ── onRefresh prop ─────────────────────────────────────────────────────────

  it("renders a refresh button in the header when onRefresh is provided", () => {
    render(
      <WidgetCard title="Sales" onRefresh={() => {}}>
        Content
      </WidgetCard>,
    );
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("does not render a refresh button when onRefresh is not provided", () => {
    render(<WidgetCard title="Sales">Content</WidgetCard>);
    expect(
      screen.queryByRole("button", { name: "Refresh" }),
    ).not.toBeInTheDocument();
  });

  it("calls onRefresh when the refresh button is clicked", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(
      <WidgetCard title="Sales" onRefresh={onRefresh}>
        Content
      </WidgetCard>,
    );
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("renders the refresh button disabled when refreshDisabled is true", () => {
    render(
      <WidgetCard title="Sales" onRefresh={() => {}} refreshDisabled>
        Content
      </WidgetCard>,
    );
    const btn = screen.getByRole("button", { name: "Refresh" });
    expect(btn).toBeDisabled();
  });

  it("renders the refresh button enabled by default", () => {
    render(
      <WidgetCard title="Sales" onRefresh={() => {}}>
        Content
      </WidgetCard>,
    );
    const btn = screen.getByRole("button", { name: "Refresh" });
    expect(btn).not.toBeDisabled();
  });

  it("renders the refresh button alongside headerExtra", () => {
    render(
      <WidgetCard
        title="Sales"
        onRefresh={() => {}}
        headerExtra={<button>Fullscreen</button>}
      >
        Content
      </WidgetCard>,
    );
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByText("Fullscreen")).toBeInTheDocument();
  });

  // ── Submenu support (#912) ─────────────────────────────────────────────
  describe("submenu actions", () => {
    it("renders a submenu trigger when an action has children", async () => {
      const user = userEvent.setup();
      const actions = [
        {
          label: "Export",
          children: [
            { label: "CSV", onClick: vi.fn() },
            { label: "PNG", onClick: vi.fn() },
          ],
        },
        { label: "Edit", onClick: vi.fn() },
      ];
      render(
        <WidgetCard title="Sales" actions={actions}>
          Content
        </WidgetCard>,
      );

      await user.click(screen.getByRole("button", { name: "Widget actions" }));
      // The submenu trigger renders as a menuitem labelled "Export"
      const exportTrigger = await screen.findByRole("menuitem", {
        name: /Export/,
      });
      expect(exportTrigger).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: "Edit" }),
      ).toBeInTheDocument();
    });

    it("fires child onClick when a submenu item is keyboard-activated", async () => {
      const onCsv = vi.fn();
      const user = userEvent.setup();
      const actions = [
        {
          label: "Export",
          children: [{ label: "CSV", onClick: onCsv }],
        },
      ];
      render(
        <WidgetCard title="Sales" actions={actions}>
          Content
        </WidgetCard>,
      );
      await user.click(screen.getByRole("button", { name: "Widget actions" }));
      // Radix submenus open on ArrowRight from the trigger and don't reliably
      // respond to .click() in jsdom (no hover/pointer events). Use keyboard
      // traversal which matches the documented keyboard-nav contract.
      const trigger = await screen.findByRole("menuitem", { name: /Export/ });
      trigger.focus();
      await user.keyboard("{ArrowRight}");
      await user.keyboard("{Enter}");
      expect(onCsv).toHaveBeenCalledOnce();
    });

    it("renders a flat menu item (not a submenu trigger) when action has no children", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const actions = [{ label: "Edit", onClick }];
      render(
        <WidgetCard title="Sales" actions={actions}>
          Content
        </WidgetCard>,
      );
      await user.click(screen.getByRole("button", { name: "Widget actions" }));
      const item = await screen.findByRole("menuitem", { name: "Edit" });
      // SubTrigger items get aria-haspopup="menu"; flat MenuItem doesn't.
      expect(item.getAttribute("aria-haspopup")).toBeNull();
      await user.click(item);
      expect(onClick).toHaveBeenCalledOnce();
    });
  });
});
