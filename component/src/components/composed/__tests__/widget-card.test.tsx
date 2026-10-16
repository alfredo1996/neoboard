import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
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

  it("exposes a truncated title and source line in full as a tooltip (#2056)", () => {
    render(
      <WidgetCard title="Sales" source="Last 30 days">
        Content
      </WidgetCard>,
    );
    for (const text of ["Sales", "Last 30 days"]) {
      expect(screen.getByText(text)).toHaveAttribute("title", text);
    }
  });

  // #1519 relies on this: a content widget with no title passes "" so that no
  // heading renders, while its actions must stay reachable. Asserted here
  // rather than in app/ because this is the contract that fix depends on.
  it("renders no heading for an empty title but keeps its actions", () => {
    render(
      <WidgetCard title="" actions={[{ label: "Edit", onClick: vi.fn() }]}>
        Content
      </WidgetCard>,
    );
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Widget actions" }),
    ).toBeInTheDocument();
  });

  it("reserves the source line when there is no source (#1246)", () => {
    // Two widgets side by side must start their content at the same height.
    // Without a reserved line, a card with a source pushes its chart down
    // relative to its neighbour and the row visibly fails to align.
    const { container } = render(
      <WidgetCard title="Sales">Content</WidgetCard>,
    );
    const placeholder = container.querySelector("[data-source-placeholder]");
    expect(placeholder).toBeInTheDocument();
    // Reserved space must be invisible to assistive tech — it carries no meaning.
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
    expect(placeholder?.textContent).toBe("");
  });

  it("does not render a placeholder when a source is present (#1246)", () => {
    const { container } = render(
      <WidgetCard title="Sales" source="Last 30 days">
        Content
      </WidgetCard>,
    );
    expect(
      container.querySelector("[data-source-placeholder]"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
  });

  it("reserves no source line when the card has no title either (#1246)", () => {
    // A chrome-less card (no title, no subtitle) should not grow a phantom
    // header line — the reservation exists to align titled cards with each other.
    const { container } = render(<WidgetCard>Content</WidgetCard>);
    expect(
      container.querySelector("[data-source-placeholder]"),
    ).not.toBeInTheDocument();
  });

  it("renders source", () => {
    render(
      <WidgetCard title="Sales" source="Last 30 days">
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

  it("renders no drag handle in view mode, so the title gets the full header", () => {
    render(<WidgetCard title="Sales">Content</WidgetCard>);
    expect(screen.queryByText("Drag to reorder")).not.toBeInTheDocument();
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
    // The header slot must not be present at all.
    expect(
      container.querySelector("[data-widget-header]"),
    ).not.toBeInTheDocument();
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

  // ── Ruled sheet: actions overlay the header (#2219) ───────────────────────

  function stubTouch(touch: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: touch && query === "(hover: none)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  }

  describe("view-mode actions", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("are reachable by Tab at rest, in order, without a hover", async () => {
      const user = userEvent.setup();
      render(
        <WidgetCard
          title="Sales"
          onRefresh={() => {}}
          onFullscreen={() => {}}
          actions={[{ label: "Edit", onClick: vi.fn() }]}
        >
          Content
        </WidgetCard>,
      );
      for (const name of ["Refresh", "Fullscreen", "Widget actions"]) {
        await user.tab();
        expect(screen.getByRole("button", { name })).toHaveFocus();
      }
    });

    it("are hidden with opacity only, never display or visibility", () => {
      render(
        <WidgetCard title="Sales" onRefresh={() => {}}>
          Content
        </WidgetCard>,
      );
      const bar = screen.getByRole("button", {
        name: "Refresh",
      }).parentElement!;
      expect(bar).toHaveClass("opacity-0");
      expect(bar.className).not.toMatch(/\b(hidden|invisible)\b/);
      expect(bar).not.toHaveAttribute("hidden");
      expect(bar).not.toHaveAttribute("aria-hidden");
    });

    it("cannot be hit while invisible, only once hovered, focused or open", () => {
      // jsdom has no layout, so the class contract stands in for
      // elementFromPoint: an invisible Refresh must not take a tap.
      render(
        <WidgetCard title="Sales" onRefresh={() => {}}>
          Content
        </WidgetCard>,
      );
      const bar = screen.getByRole("button", {
        name: "Refresh",
      }).parentElement!;
      for (const cls of [
        "[@media(any-pointer:coarse)]:pointer-events-none",
        "group-hover/panel:pointer-events-auto",
        "group-focus-within/panel:pointer-events-auto",
        "has-[[data-state=open]]:pointer-events-auto",
      ]) {
        expect(bar).toHaveClass(cls);
      }
    });

    it("follow the hover tint instead of painting their own rectangle", () => {
      render(
        <WidgetCard title="Sales" onRefresh={() => {}}>
          Content
        </WidgetCard>,
      );
      const refresh = screen.getByRole("button", { name: "Refresh" });
      const bar = refresh.parentElement!;
      expect(bar).toHaveClass("group-hover/panel:bg-panel-hover");
      expect(refresh).toHaveClass("bg-inherit");
      expect(refresh).not.toHaveClass("bg-card");
    });

    it("call onFullscreen with the button that was pressed", async () => {
      const user = userEvent.setup();
      const onFullscreen = vi.fn();
      render(
        <WidgetCard title="Sales" onFullscreen={onFullscreen}>
          Content
        </WidgetCard>,
      );
      const btn = screen.getByRole("button", { name: "Fullscreen" });
      await user.click(btn);
      expect(onFullscreen).toHaveBeenCalledExactlyOnceWith(btn);
    });
  });

  describe("on a touch screen (hover: none)", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("shows only the menu button, with Refresh and Fullscreen inside it", async () => {
      stubTouch(true);
      const user = userEvent.setup();
      const onRefresh = vi.fn();
      const onFullscreen = vi.fn();
      render(
        <WidgetCard
          title="Sales"
          onRefresh={onRefresh}
          onFullscreen={onFullscreen}
          actions={[{ label: "Edit", onClick: vi.fn() }]}
        >
          Content
        </WidgetCard>,
      );
      expect(
        screen.queryByRole("button", { name: "Refresh" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Fullscreen" }),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Widget actions" }));
      await user.click(screen.getByRole("menuitem", { name: "Refresh" }));
      expect(onRefresh).toHaveBeenCalledOnce();

      await user.click(screen.getByRole("button", { name: "Widget actions" }));
      await user.click(screen.getByRole("menuitem", { name: "Fullscreen" }));
      // No icon button was pressed: the app falls back to the focused menu trigger.
      expect(onFullscreen).toHaveBeenCalledExactlyOnceWith(null);
    });

    it("keeps the menu button always visible", () => {
      stubTouch(true);
      render(
        <WidgetCard
          title="Sales"
          onFullscreen={() => {}}
          actions={[{ label: "Edit", onClick: vi.fn() }]}
        >
          Content
        </WidgetCard>,
      );
      const bar = screen.getByRole("button", {
        name: "Widget actions",
      }).parentElement!;
      expect(bar).not.toHaveClass("opacity-0");
    });

    it("lists a disabled Refresh as disabled", async () => {
      stubTouch(true);
      const user = userEvent.setup();
      render(
        <WidgetCard title="Sales" onRefresh={() => {}} refreshDisabled>
          Content
        </WidgetCard>,
      );
      await user.click(screen.getByRole("button", { name: "Widget actions" }));
      expect(screen.getByRole("menuitem", { name: "Refresh" })).toHaveAttribute(
        "data-disabled",
      );
    });
  });

  describe("in edit mode (draggable)", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("keeps every control visible, even on a touch screen", () => {
      stubTouch(true);
      render(
        <WidgetCard
          draggable
          title="Sales"
          onRefresh={() => {}}
          onFullscreen={() => {}}
          actions={[{ label: "Edit", onClick: vi.fn() }]}
        >
          Content
        </WidgetCard>,
      );
      const refresh = screen.getByRole("button", { name: "Refresh" });
      expect(screen.getByRole("button", { name: "Fullscreen" })).toBeVisible();
      expect(refresh.parentElement).not.toHaveClass("opacity-0");
    });
  });

  describe("flat panel (#2219)", () => {
    it("positions the controls absolutely in view and edit, so toggling edit keeps scroll anchoring", () => {
      for (const draggable of [false, true]) {
        const { unmount } = render(
          <WidgetCard title="Sales" draggable={draggable} onRefresh={() => {}}>
            x
          </WidgetCard>,
        );
        expect(
          screen.getByRole("button", { name: "Refresh" }).parentElement,
        ).toHaveClass("absolute");
        unmount();
      }
    });

    it("keeps the panel's own border and radius in view mode, with no outline trick", () => {
      const { container } = render(<WidgetCard title="Sales">x</WidgetCard>);
      const panel = container.firstElementChild!;
      expect(panel).toHaveClass("rounded-md", "border-rule");
      expect(panel.className).not.toMatch(/outline|border-0|rounded-none/);
    });

    it("tints the hovered panel in view mode only", () => {
      const view = render(<WidgetCard title="Sales">x</WidgetCard>);
      expect(view.container.firstElementChild).toHaveClass(
        "hover:bg-panel-hover",
      );
      view.unmount();
      const edit = render(
        <WidgetCard draggable title="Sales">
          x
        </WidgetCard>,
      );
      expect(edit.container.firstElementChild).not.toHaveClass(
        "hover:bg-panel-hover",
      );
    });

    it("puts handle, title and controls in one 36 px row, with the source line below it", () => {
      render(
        <WidgetCard
          draggable
          title="Sales"
          source="Neo4j Movies"
          onRefresh={() => {}}
        >
          x
        </WidgetCard>,
      );
      const row = screen
        .getByRole("heading", { name: "Sales" })
        .closest("[data-widget-row]")!;
      expect(row).toHaveClass("h-9", "items-center");
      expect(row).toContainElement(screen.getByText("Drag to reorder"));
      expect(row).toContainElement(
        screen.getByRole("button", { name: "Refresh" }),
      );
      // The source line (#1246) is reserved below the row, outside it.
      expect(row).not.toContainElement(screen.getByText("Neo4j Movies"));
    });
  });
});
