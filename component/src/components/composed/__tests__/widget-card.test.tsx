import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { WidgetCard } from "../widget-card";

describe("WidgetCard driven and refreshing (#2369)", () => {
  const panel = (c: HTMLElement) => c.firstElementChild as HTMLElement;

  it("driven with a label shows the tag in the source line beside the source, and the ring edge", () => {
    const { container } = render(
      <WidgetCard title="Films" source="Movies graph" driven="Uses Actor">
        x
      </WidgetCard>,
    );
    expect(screen.getByText("Uses Actor")).toBeInTheDocument();
    expect(screen.getByText("Movies graph")).toBeInTheDocument();
    expect(panel(container)).toHaveAttribute("data-driven", "true");
    expect(panel(container)).toHaveClass("border-ring");
  });

  it("driven puts the tag on the reserved source line of a card with no source", () => {
    render(
      <WidgetCard title="Films" driven="Uses Actor">
        x
      </WidgetCard>,
    );
    expect(screen.getByText("Uses Actor")).toBeInTheDocument();
  });

  it("driven without a label draws the edge only", () => {
    const { container } = render(<WidgetCard driven>x</WidgetCard>);
    expect(panel(container)).toHaveClass("border-ring");
    expect(screen.queryByText(/^Uses /)).not.toBeInTheDocument();
  });

  it("a card that is not driven has no edge, tag or marker", () => {
    const { container } = render(<WidgetCard title="Films">x</WidgetCard>);
    expect(panel(container)).not.toHaveAttribute("data-driven");
    expect(panel(container)).not.toHaveClass("border-ring");
  });

  it("refreshing draws the line and keeps the children mounted", () => {
    const { container } = render(
      <WidgetCard title="Films" refreshing>
        <p>old rows</p>
      </WidgetCard>,
    );
    expect(container.querySelector("[data-refresh-line]")).toBeInTheDocument();
    expect(screen.getByText("old rows")).toBeInTheDocument();
    expect(panel(container)).toHaveAttribute("aria-busy", "true");
  });

  it("not refreshing draws no line", () => {
    const { container } = render(<WidgetCard title="Films">x</WidgetCard>);
    expect(container.querySelector("[data-refresh-line]")).toBeNull();
  });
});

describe("WidgetCard", () => {
  it("renders children", () => {
    render(<WidgetCard>Content here</WidgetCard>);
    expect(screen.getByText("Content here")).toBeInTheDocument();
  });

  it("renders title", () => {
    render(<WidgetCard title="Sales">Content</WidgetCard>);
    expect(screen.getByText("Sales")).toBeInTheDocument();
  });

  it("renders titleIcon before the title (#2367)", () => {
    render(
      <WidgetCard title="Sales" titleIcon={<svg data-testid="ti" />}>
        Content
      </WidgetCard>,
    );
    const icon = screen.getByTestId("ti");
    const title = screen.getByText("Sales");
    expect(
      icon.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
      <WidgetCard mode="edit" title="Sales">
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
      <WidgetCard mode="edit" title="Sales" onDragHandleMouseDown={onMouseDown}>
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
          mode="edit"
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

  describe("title row (#2219)", () => {
    // Controls that stay in view (edit mode) are overlaid by the absolute bar,
    // so the title row reserves room: each control is a 28 px button plus a
    // 2 px gap, and the bar sits 10 px from the edge.
    it.each([
      [2, 2 * (28 + 2) + 10],
      [4, 4 * (28 + 2) + 10],
    ])("reserves room for %i controls in edit mode (%ipx)", (n, px) => {
      render(
        <WidgetCard
          mode="edit"
          title="Sales"
          onRefresh={() => {}}
          onFullscreen={() => {}}
          headerExtra={n === 4 ? <button>Badge</button> : undefined}
          actions={n === 4 ? [{ label: "Edit", onClick: vi.fn() }] : undefined}
        >
          x
        </WidgetCard>,
      );
      const title = screen.getByRole("heading", { name: "Sales" });
      expect(title.parentElement).toHaveStyle({ paddingRight: `${px}px` });
    });

    it("positions the controls absolutely in view and edit, so toggling edit keeps scroll anchoring", () => {
      for (const mode of ["view", "edit"] as const) {
        const { unmount } = render(
          <WidgetCard title="Sales" mode={mode} onRefresh={() => {}}>
            x
          </WidgetCard>,
        );
        expect(
          screen.getByRole("button", { name: "Refresh" }).parentElement,
        ).toHaveClass("absolute");
        unmount();
      }
    });

    it("sits on the card edge and radius in view mode, with no outline trick", () => {
      const { container } = render(<WidgetCard title="Sales">x</WidgetCard>);
      const panel = container.firstElementChild!;
      expect(panel).toHaveClass("rounded-md", "border-card-edge");
      expect(panel.className).not.toMatch(/outline|border-0|rounded-none/);
    });

    it("puts handle, title and controls in one 36 px row, with the source line below it", () => {
      render(
        <WidgetCard
          mode="edit"
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

  describe("BI card (#2247)", () => {
    const panelOf = (c: HTMLElement) => c.firstElementChild!;
    const headerOf = (c: HTMLElement) =>
      c.querySelector("[data-widget-header]")!;

    it("defaults to the approved look: edge, shadow, sans (body face) title, header rule", () => {
      const { container } = render(<WidgetCard title="Sales">x</WidgetCard>);
      expect(panelOf(container)).toHaveClass(
        "bg-card",
        "border-card-edge",
        "shadow-card",
        "hover:border-card-edge-hover",
        "focus-within:border-card-edge-hover",
      );
      expect(screen.getByRole("heading")).toHaveClass("font-body");
      expect(headerOf(container)).toHaveClass("border-b", "border-rule");
    });

    it("an untitled card in view mode has no header band: no padding, no rule (#2232)", () => {
      const { container } = render(
        <WidgetCard onFullscreen={() => {}}>Text</WidgetCard>,
      );
      const header = headerOf(container);
      expect(header).toHaveClass("p-0", "border-b-0");
      expect(header).not.toHaveClass("border-b");
      // Its controls are still there to reach
      expect(
        screen.getByRole("button", { name: "Fullscreen" }),
      ).toBeInTheDocument();
    });

    it("an untitled card with a source keeps its band, and the source can be a link (#2232)", () => {
      const { container } = render(
        <WidgetCard
          onFullscreen={() => {}}
          source={<a href="https://example.com">example.com</a>}
        >
          x
        </WidgetCard>,
      );
      const header = headerOf(container);
      expect(header).toHaveClass("pt-3", "border-b");
      expect(header).not.toHaveClass("p-0");
      expect(
        within(header as HTMLElement).getByRole("link", {
          name: "example.com",
        }),
      ).toBeInTheDocument();
    });

    it("titleFont sets the title face and marks the panel for the KPI number", () => {
      const { container } = render(
        <WidgetCard title="Sales" titleFont="serif">
          x
        </WidgetCard>,
      );
      expect(panelOf(container)).toHaveAttribute("data-title-font", "serif");
      const h = screen.getByRole("heading");
      expect(h).toHaveClass("font-serif", "font-semibold");
      expect(h).not.toHaveClass("font-body");
    });

    it("headerRule off keeps the border's room but makes it transparent", () => {
      const { container } = render(
        <WidgetCard title="Sales" headerRule={false}>
          x
        </WidgetCard>,
      );
      expect(headerOf(container)).toHaveClass("border-b", "border-transparent");
      expect(headerOf(container)).not.toHaveClass("border-rule");
    });

    it("elevation off drops the shadow", () => {
      const { container } = render(
        <WidgetCard title="Sales" elevation={false}>
          x
        </WidgetCard>,
      );
      expect(panelOf(container)).toHaveClass("shadow-none");
      expect(panelOf(container)).not.toHaveClass("shadow-card");
    });

    it("edit mode is a dashed strong edge with no shadow, and all chrome visible", () => {
      const { container } = render(
        <WidgetCard mode="edit" title="Sales" onRefresh={() => {}}>
          x
        </WidgetCard>,
      );
      expect(panelOf(container)).toHaveClass(
        "border-dashed",
        "border-rule-strong",
        "shadow-none",
      );
      expect(panelOf(container)).not.toHaveClass("shadow-card");
      expect(screen.getByText("Drag to reorder")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Refresh" }).parentElement,
      ).not.toHaveClass("opacity-0");
    });

    it("lays the header out as 12/16/10 and the body as 12/16/16", () => {
      const { container } = render(<WidgetCard title="Sales">x</WidgetCard>);
      expect(headerOf(container)).toHaveClass("px-4", "pt-3", "pb-2.5");
      expect(screen.getByText("x")).toHaveClass("px-4", "pt-3", "pb-4");
    });

    it("sets the source line at 12 px in ink 3", () => {
      render(
        <WidgetCard title="Sales" source="Movies · 5 rows · 2 min ago">
          x
        </WidgetCard>,
      );
      expect(screen.getByText("Movies · 5 rows · 2 min ago")).toHaveClass(
        "text-meta",
        "text-muted-foreground",
      );
    });
  });
});

describe("WidgetCard background and description (#2394)", () => {
  const panel = (c: HTMLElement) => c.firstElementChild as HTMLElement;

  it("a default card has no data-card-fill; a background sets it", () => {
    const { container, rerender } = render(<WidgetCard>x</WidgetCard>);
    expect(panel(container)).not.toHaveAttribute("data-card-fill");
    rerender(<WidgetCard background="default">x</WidgetCard>);
    expect(panel(container)).not.toHaveAttribute("data-card-fill");
    rerender(<WidgetCard background="rose">x</WidgetCard>);
    expect(panel(container)).toHaveAttribute("data-card-fill", "rose");
    rerender(<WidgetCard background="none">x</WidgetCard>);
    expect(panel(container)).toHaveAttribute("data-card-fill", "none");
  });

  it("draws the info icon only with a description", () => {
    const { rerender } = render(<WidgetCard title="Sales">x</WidgetCard>);
    expect(
      screen.queryByRole("button", { name: "About this card" }),
    ).not.toBeInTheDocument();
    rerender(
      <WidgetCard title="Sales" description="  ">
        x
      </WidgetCard>,
    );
    expect(
      screen.queryByRole("button", { name: "About this card" }),
    ).not.toBeInTheDocument();
    rerender(
      <WidgetCard title="Sales" description="Gross, in dollars">
        x
      </WidgetCard>,
    );
    expect(
      screen.getByRole("button", { name: "About this card" }),
    ).toBeInTheDocument();
  });

  it("keeps the icon outside a truncating title, and it does not shrink", () => {
    render(
      <WidgetCard title="A very long title" description="About it">
        x
      </WidgetCard>,
    );
    const icon = screen.getByRole("button", { name: "About this card" });
    const title = screen.getByRole("heading");
    expect(title).toHaveClass("truncate");
    expect(title).not.toContainElement(icon);
    expect(icon).toHaveClass("shrink-0");
    expect(icon.parentElement).toBe(title.parentElement);
  });

  it("opens the text on keyboard focus and closes it on blur", async () => {
    const user = userEvent.setup();
    render(
      <WidgetCard title="Sales" description="Gross, in dollars">
        x
      </WidgetCard>,
    );
    await user.tab();
    const icon = screen.getByRole("button", { name: "About this card" });
    expect(icon).toHaveFocus();
    expect(await screen.findByText("Gross, in dollars")).toBeInTheDocument();
    await user.tab();
    await waitFor(() =>
      expect(screen.queryByText("Gross, in dollars")).not.toBeInTheDocument(),
    );
  });

  it("opens on hover and on a tap", async () => {
    const user = userEvent.setup();
    render(
      <WidgetCard title="Sales" description="Gross, in dollars">
        x
      </WidgetCard>,
    );
    const icon = screen.getByRole("button", { name: "About this card" });
    await user.hover(icon);
    expect(await screen.findByText("Gross, in dollars")).toBeInTheDocument();
    await user.unhover(icon);
    await waitFor(() =>
      expect(screen.queryByText("Gross, in dollars")).not.toBeInTheDocument(),
    );
    // A touch has no hover: the click alone must open it.
    fireEvent.click(icon);
    expect(await screen.findByText("Gross, in dollars")).toBeInTheDocument();
  });

  it("a card with a description and no title keeps a header row with the icon", () => {
    render(<WidgetCard description="About it">x</WidgetCard>);
    const header = document.querySelector("[data-widget-header]");
    expect(header).toBeInTheDocument();
    expect(header).not.toHaveClass("p-0");
    expect(
      within(header as HTMLElement).getByRole("button", {
        name: "About this card",
      }),
    ).toBeInTheDocument();
  });
});
