import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardViewToolbar } from "@/components/dashboard-view-toolbar";
import { DashboardEditToolbar } from "@/components/dashboard-edit-toolbar";

vi.mock("@/components/dashboard-assign-panel", () => ({
  DashboardAssignPanel: () => <div data-testid="assign-panel" />,
}));

const viewProps = {
  dashboardId: "d1",
  name: "Movie Analytics",
  updatedAt: new Date(Date.now() - 3 * 60_000),
  updatedByName: "Alice Demo",
  widgetCount: 12,
  isPublic: false,
  isAdmin: true,
  onTogglePublic: vi.fn(),
  canEdit: true,
  isFetching: false,
  refetchInterval: false as const,
  onApplyInterval: vi.fn(),
  isEnteringEdit: false,
  onEdit: vi.fn(),
  onDashboards: vi.fn(),
};

const editProps = {
  dashboardId: "d1",
  name: "Movie Analytics",
  updatedAt: new Date(Date.now() - 3 * 60_000),
  updatedByName: "Alice Demo",
  widgetCount: 1,
  isAdmin: true,
  isPublic: true,
  onTogglePublic: vi.fn(),
  isSaving: false,
  onAddWidget: vi.fn(),
  onSave: vi.fn(),
  onLeave: vi.fn(),
  onCancel: vi.fn(),
  onDashboards: vi.fn(),
};

const crumbs = () => screen.getByRole("navigation", { name: "breadcrumb" });

describe("DashboardViewToolbar", () => {
  it("shows breadcrumb, title, meta and the view actions in the kit header", async () => {
    const onEdit = vi.fn();
    render(
      <DashboardViewToolbar
        {...viewProps}
        onEdit={onEdit}
        tabs={<div data-testid="tabs" />}
      />,
    );

    expect(
      within(crumbs()).getByRole("link", { name: "Dashboards" }),
    ).toHaveAttribute("href", "/");
    expect(crumbs()).toHaveTextContent("Movie Analytics");
    expect(
      screen.getByRole("heading", { level: 1, name: "Movie Analytics" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Updated/)).toHaveTextContent(
      /Updated .* by Alice Demo · 12 widgets/,
    );
    expect(screen.getByTestId("auto-refresh-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("tabs")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Back/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Filters/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("says Public in the meta when the dashboard is public", () => {
    render(<DashboardViewToolbar {...viewProps} isPublic />);
    expect(screen.getByText(/Updated/)).toHaveTextContent("· Public");
  });

  it("offers no auto-refresh or Edit to a viewer who cannot edit", () => {
    render(<DashboardViewToolbar {...viewProps} canEdit={false} />);
    expect(screen.queryByTestId("auto-refresh-trigger")).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
  });

  it("opens the sharing sheet from view mode, for admins only", async () => {
    const { unmount } = render(<DashboardViewToolbar {...viewProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByTestId("assign-panel")).toBeInTheDocument();
    unmount();

    render(<DashboardViewToolbar {...viewProps} isAdmin={false} />);
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });

  it.each([
    ["Cmd", { metaKey: true }],
    ["Ctrl", { ctrlKey: true }],
    ["Shift", { shiftKey: true }],
    ["middle", { button: 1 }],
  ])(
    "%s-click on the Dashboards crumb keeps the browser's own link",
    (_, init) => {
      const onDashboards = vi.fn();
      render(
        <DashboardViewToolbar {...viewProps} onDashboards={onDashboards} />,
      );
      const notPrevented = fireEvent.click(
        screen.getByRole("link", { name: "Dashboards" }),
        init,
      );
      expect(notPrevented).toBe(true);
      expect(onDashboards).not.toHaveBeenCalled();
    },
  );
});

describe("custom auto-refresh interval typing (#2293)", () => {
  it.each(["5", "10"])(
    "typing %s then Enter applies it, not a typeahead menu item",
    async (typed) => {
      const onApplyInterval = vi.fn();
      render(
        <DashboardViewToolbar
          {...viewProps}
          onApplyInterval={onApplyInterval}
        />,
      );
      await userEvent.click(screen.getByTestId("auto-refresh-trigger"));
      const input = screen.getByTestId("custom-interval-input");
      await userEvent.click(input);
      await userEvent.keyboard(typed);
      await userEvent.keyboard("{Enter}");
      expect(onApplyInterval).toHaveBeenCalledWith(Number(typed));
      expect(onApplyInterval).toHaveBeenCalledTimes(1);
    },
  );
});

describe("header filters slot (#2297)", () => {
  it("puts the Filters control first in the view header's actions", () => {
    render(
      <DashboardViewToolbar
        {...viewProps}
        filters={<button type="button">Filters</button>}
      />,
    );
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names.indexOf("Filters")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("Filters")).toBeLessThan(names.indexOf("Share"));
  });

  it("does the same in the edit header", () => {
    render(
      <DashboardEditToolbar
        {...editProps}
        filters={<button type="button">Filters</button>}
      />,
    );
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names.indexOf("Filters")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("Filters")).toBeLessThan(names.indexOf("Sharing"));
  });
});

describe("DashboardEditToolbar", () => {
  it("shows the name as the title, the Editing crumb, meta and the edit actions", async () => {
    const onSave = vi.fn();
    const onAddWidget = vi.fn();
    render(
      <DashboardEditToolbar
        {...editProps}
        onSave={onSave}
        onAddWidget={onAddWidget}
        tabs={<div data-testid="tabs" />}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Movie Analytics" }),
    ).toBeInTheDocument();
    const current = crumbs().querySelector('[aria-current="page"]');
    expect(current).toHaveTextContent("Editing");
    expect(screen.getByText(/Updated/)).toHaveTextContent("· 1 widget");
    expect(screen.getByRole("button", { name: /Sharing/ })).toBeInTheDocument();
    expect(screen.getByTestId("tabs")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Back/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Filters/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Add Widget/ }));
    await userEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(onAddWidget).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("offers Add page only when the page has no tabs row of its own", async () => {
    const onAddPage = vi.fn();
    const { rerender } = render(<DashboardEditToolbar {...editProps} />);
    expect(screen.queryByRole("button", { name: /Add page/ })).toBeNull();

    rerender(<DashboardEditToolbar {...editProps} onAddPage={onAddPage} />);
    await userEvent.click(screen.getByRole("button", { name: /Add page/ }));
    expect(onAddPage).toHaveBeenCalledOnce();
  });

  it("has a Cancel button before Save, with the Cmd+E hint, that calls onCancel", async () => {
    const onCancel = vi.fn();
    render(<DashboardEditToolbar {...editProps} onCancel={onCancel} />);

    const cancel = screen.getByRole("button", { name: "Cancel" });
    const save = screen.getByRole("button", { name: /Save/ });
    expect(cancel.querySelector("kbd")).toHaveTextContent(/⌘E|Ctrl E/);
    expect(
      cancel.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await userEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("leaves edit mode through the dashboard's crumb", async () => {
    const onLeave = vi.fn();
    render(<DashboardEditToolbar {...editProps} onLeave={onLeave} />);

    await userEvent.click(
      within(crumbs()).getByRole("link", { name: "Movie Analytics" }),
    );
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("calls onDashboards from the Dashboards crumb, for the caller to ask first", async () => {
    const onDashboards = vi.fn();
    render(<DashboardEditToolbar {...editProps} onDashboards={onDashboards} />);
    await userEvent.click(screen.getByRole("link", { name: "Dashboards" }));
    expect(onDashboards).toHaveBeenCalledOnce();
  });

  it.each([
    ["Dashboards", "onDashboards"],
    ["Movie Analytics", "onLeave"],
  ] as const)(
    "Cmd-click on the %s crumb keeps the browser's own link",
    (name, handler) => {
      const fn = vi.fn();
      render(<DashboardEditToolbar {...editProps} {...{ [handler]: fn }} />);
      const notPrevented = fireEvent.click(
        within(crumbs()).getByRole("link", { name }),
        { metaKey: true },
      );
      expect(notPrevented).toBe(true);
      expect(fn).not.toHaveBeenCalled();
    },
  );

  it("hides Sharing from non-admins", () => {
    render(<DashboardEditToolbar {...editProps} isAdmin={false} />);
    expect(screen.queryByRole("button", { name: /Sharing/ })).toBeNull();
  });
});
