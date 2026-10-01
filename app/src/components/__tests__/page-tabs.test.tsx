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
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { DashboardPage, DashboardWidget } from "@/lib/db/schema";

vi.mock("@neoboard/components", () => ({
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
    title,
    description,
    confirmText,
    onConfirm,
    returnFocusTo,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: React.ReactNode;
    confirmText?: string;
    onConfirm: () => void;
    returnFocusTo?: HTMLElement | null;
  }) =>
    open ? (
      <div
        role="alertdialog"
        aria-label={title}
        data-return-focus={returnFocusTo?.id}
      >
        <p>{description}</p>
        <button onClick={() => onOpenChange(false)}>Cancel</button>
        <button
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmText}
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
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete page" }));
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
      name: 'Delete "Sales"?',
    });
    expect(dialog).toHaveTextContent("its 3 widgets");
    // Focus goes back to the menu button Delete page was picked from.
    expect(dialog).toHaveAttribute("data-return-focus", "page-options-trigger");
  });

  it("uses the singular for a page with one widget", () => {
    renderTabs([page("p1", "Overview", 2), page("p2", "Solo", 1)]);

    clickDeletePage();

    expect(
      screen.getByRole("alertdialog", { name: 'Delete "Solo"?' }),
    ).toHaveTextContent("its 1 widget.");
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
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

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
    expect(screen.getByRole("textbox")).toHaveValue("Sales");
    holdsOnlyTabs();
  });
});
