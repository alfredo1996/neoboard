/**
 * PageTabs — Delete page asks first when the page holds widgets (#2055).
 *
 * The real menu and dialog are Radix; the mock renders the menu items and the
 * confirm dialog as plain buttons so the test drives PageTabs' own logic. What
 * the dialog does with Escape and focus is the component library's, covered in
 * its own tests and by the dashboard-editor E2E.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import type { DashboardPage, DashboardWidget } from "@/lib/db/schema";

vi.mock("@neoboard/components", async () => ({
  // The real tabs: PageTabs is built on them (#2221).
  Tabs: (await import("@neoboard/components/ui")).Tabs,
  TabsList: (await import("@neoboard/components/ui")).TabsList,
  TabsTrigger: (await import("@neoboard/components/ui")).TabsTrigger,
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: Record<string, unknown>) => <input {...props} />,
  DropdownMenu: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: React.PropsWithChildren) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button role="menuitem" onClick={onClick}>
      {children}
    </button>
  ),
  ConfirmDialog: ({
    open,
    onOpenChange,
    action,
    object,
    name,
    consequences,
    onConfirm,
    returnFocusTo,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    action: string;
    object?: string;
    name?: string;
    consequences?: React.ReactNode;
    onConfirm: () => void;
    returnFocusTo?: HTMLElement | null;
  }) =>
    open ? (
      <div
        role="alertdialog"
        aria-label={`${action} ${name ?? ""}`.trim()}
        data-return-focus={returnFocusTo?.id}
      >
        <p>{consequences}</p>
        <button onClick={() => onOpenChange(false)}>Cancel</button>
        <button
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {object ? `${action} ${object}` : action}
        </button>
      </div>
    ) : null,
  focusedMenuTrigger: () => menuTrigger,
  cn: (...c: unknown[]) => c.filter(Boolean).join(" "),
}));

// What `focusedMenuTrigger()` finds: the "Page options" button.
const menuTrigger = Object.assign(document.createElement("button"), {
  id: "page-options-trigger",
});

const { PageTabs } = await import("../page-tabs");

function widget(id: string): DashboardWidget {
  return { id, chartType: "bar", connectionId: "c", query: "q" };
}

function page(id: string, title: string, widgetCount: number): DashboardPage {
  const widgets = Array.from({ length: widgetCount }, (_, i) =>
    widget(`${id}-w${i}`),
  );
  return {
    id,
    title,
    widgets,
    gridLayout: widgets.map((w) => ({ i: w.id, x: 0, y: 0, w: 4, h: 4 })),
  };
}

function renderTabs(pages: DashboardPage[]) {
  const onRemove = vi.fn();
  render(
    <PageTabs
      pages={pages}
      activeIndex={1}
      editable
      onSelect={vi.fn()}
      onRemove={onRemove}
    />,
  );
  return { onRemove };
}

/** One options menu, for the active page (#2107): page 1 in `renderTabs`. */
function clickDeletePage() {
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete page…" }));
}

describe("PageTabs — Delete page (#2055)", () => {
  it("asks before deleting a page with widgets, naming the page and how many widgets go with it", () => {
    const { onRemove } = renderTabs([
      page("p1", "Overview", 1),
      page("p2", "Sales", 3),
    ]);

    clickDeletePage();

    expect(onRemove).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", {
      name: "Delete Sales",
    });
    expect(dialog).toHaveTextContent("Its 3 widgets go with it when you save.");
    // Focus goes back to the menu button Delete page was picked from.
    expect(dialog).toHaveAttribute("data-return-focus", "page-options-trigger");
  });

  it("uses the singular for a page with one widget", () => {
    renderTabs([page("p1", "Overview", 2), page("p2", "Solo", 1)]);

    clickDeletePage();

    expect(
      screen.getByRole("alertdialog", { name: "Delete Solo" }),
    ).toHaveTextContent("Its 1 widget goes with it when you save.");
  });

  it("cancelling keeps the page", () => {
    const { onRemove } = renderTabs([
      page("p1", "Overview", 1),
      page("p2", "Sales", 3),
    ]);

    clickDeletePage();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("tab", { name: "Sales" })).toBeInTheDocument();
  });

  it("confirming deletes the page it was opened for", () => {
    const { onRemove } = renderTabs([
      page("p1", "Overview", 1),
      page("p2", "Sales", 3),
    ]);

    clickDeletePage();
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("deletes an empty page without asking", () => {
    const { onRemove } = renderTabs([
      page("p1", "Overview", 1),
      page("p2", "Blank", 0),
    ]);

    clickDeletePage();

    expect(onRemove).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("PageTabs — the tablist holds only the tabs (#2107)", () => {
  it("keeps Page options, Add page and the rename field outside it", () => {
    renderTabs([page("p1", "Overview", 1), page("p2", "Sales", 3)]);
    const tablist = screen.getByRole("tablist");
    const holdsOnlyTabs = () => {
      expect(within(tablist).getAllByRole("tab")).toHaveLength(2);
      expect(within(tablist).queryAllByRole("button")).toEqual([]);
      expect(within(tablist).queryByRole("textbox")).toBeNull();
    };

    holdsOnlyTabs();
    for (const name of ["Page options for Sales", "Add page"]) {
      expect(tablist).not.toContainElement(
        screen.getByRole("button", { name }),
      );
    }

    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    // Away from its tab, the field's name says which page it renames.
    expect(
      screen.getByRole("textbox", { name: "Rename page Sales" }),
    ).toHaveValue("Sales");
    holdsOnlyTabs();
  });

  it("renders an empty layout in edit mode with Add page and no options menu", () => {
    // The import route accepts a layout with no pages.
    render(<PageTabs pages={[]} activeIndex={0} editable onSelect={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Add page" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Page options/ })).toBeNull();
  });
});

describe("PageTabs — drag to reorder", () => {
  const pages = [page("p1", "Overview", 1), page("p2", "Sales", 3)];

  function dropOverviewOnSales(editable: boolean) {
    const onReorder = vi.fn();
    render(
      <PageTabs
        pages={pages}
        activeIndex={0}
        editable={editable}
        onSelect={vi.fn()}
        onReorder={onReorder}
      />,
    );
    const sales = screen.getByRole("tab", { name: "Sales" });
    const accepted = !fireEvent.dragOver(sales, {
      dataTransfer: { dropEffect: "none" },
    });
    fireEvent.drop(sales, { dataTransfer: { getData: () => "0" } });
    return { onReorder, accepted };
  }

  it("moves a page in edit mode", () => {
    const { onReorder, accepted } = dropOverviewOnSales(true);
    expect(accepted).toBe(true);
    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });

  it("refuses a drop in view mode", () => {
    const { onReorder, accepted } = dropOverviewOnSales(false);
    expect(accepted).toBe(false);
    expect(onReorder).not.toHaveBeenCalled();
  });
});

describe("PageTabs — a drag never opens a page (#2221)", () => {
  const pages = [
    page("p1", "1. Bar", 1),
    page("p2", "2. Line", 1),
    page("p3", "3. Pie", 1),
  ];

  function setup(editable: boolean) {
    const onSelect = vi.fn();
    const onReorder = vi.fn();
    render(
      <PageTabs
        pages={pages}
        activeIndex={0}
        editable={editable}
        onSelect={onSelect}
        onReorder={onReorder}
      />,
    );
    return {
      onSelect,
      onReorder,
      line: screen.getByRole("tab", { name: "2. Line" }),
    };
  }

  it("edit mode: pressing an inactive tab does not open it, the click does", () => {
    const { onSelect, line } = setup(true);
    fireEvent.mouseDown(line);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.mouseUp(line);
    fireEvent.click(line, { detail: 1 });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("edit mode: a drag onto another tab reorders and opens nothing", () => {
    const { onSelect, onReorder, line } = setup(true);
    fireEvent.mouseDown(line);
    fireEvent.dragStart(line, { dataTransfer: { setData: vi.fn() } });
    const bar = screen.getByRole("tab", { name: "1. Bar" });
    fireEvent.dragOver(bar, { dataTransfer: { dropEffect: "none" } });
    fireEvent.drop(bar, { dataTransfer: { getData: () => "1" } });
    fireEvent.dragEnd(line);
    expect(onReorder).toHaveBeenCalledWith(1, 0);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("edit mode: after a drag the keyboard still selects", () => {
    const { onSelect, line } = setup(true);
    fireEvent.mouseDown(line);
    fireEvent.dragEnd(line);
    fireEvent.keyDown(line, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it.each(["Enter", " "])(
    "edit mode: %j selects exactly once, not again on the click the browser synthesises",
    (key) => {
      const { onSelect, line } = setup(true);
      fireEvent.keyDown(line, { key });
      // A keyboard-synthesised click has detail 0.
      fireEvent.click(line, { detail: 0 });
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(1);
    },
  );

  it("view mode: pressing a tab opens it, as before", () => {
    const { onSelect, line } = setup(false);
    fireEvent.mouseDown(line);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});

describe("PageTabs — built on the library tabs (#2221)", () => {
  const pages = [
    page("p1", "1. Bar", 1),
    page("p2", "2. Line", 1),
    page("p3", "3. Pie", 1),
  ];

  it("End then Enter selects the last page; arrows alone do not select", async () => {
    const onSelect = vi.fn();
    render(<PageTabs pages={pages} activeIndex={0} onSelect={onSelect} />);
    const first = screen.getByRole("tab", { name: "1. Bar" });
    first.focus();
    fireEvent.keyDown(first, { key: "End" });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "3. Pie" })).toHaveFocus(),
    );
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("tab", { name: "3. Pie" }), {
      key: "Enter",
    });
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("the tab is the drag handle: draggable in edit mode only, no grip", () => {
    const { container, rerender } = render(
      <PageTabs
        pages={pages}
        activeIndex={0}
        editable
        onSelect={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    expect(screen.getByRole("tab", { name: "2. Line" })).toHaveAttribute(
      "draggable",
      "true",
    );
    expect(container.querySelector("svg.lucide-grip-vertical")).toBeNull();
    rerender(<PageTabs pages={pages} activeIndex={0} onSelect={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "2. Line" })).not.toHaveAttribute(
      "draggable",
      "true",
    );
  });

  it("ships no aria-controls pointing at an id that is not there", () => {
    const { container } = render(
      <PageTabs pages={pages} activeIndex={0} onSelect={vi.fn()} />,
    );
    for (const tab of container.querySelectorAll("[aria-controls]")) {
      expect(
        document.getElementById(tab.getAttribute("aria-controls") ?? ""),
      ).not.toBeNull();
    }
  });
});
