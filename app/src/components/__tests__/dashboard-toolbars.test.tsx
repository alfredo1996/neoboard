import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardViewToolbar } from "@/components/dashboard-view-toolbar";
import { DashboardEditToolbar } from "@/components/dashboard-edit-toolbar";

vi.mock("@/components/dashboard-assign-panel", () => ({
  DashboardAssignPanel: () => <div data-testid="assign-panel" />,
}));

const viewProps = {
  name: "Movie Analytics",
  updatedAt: new Date(Date.now() - 3 * 60_000),
  updatedByName: "Alice Demo",
  widgetCount: 12,
  isPublic: false,
  canEdit: true,
  hasParameters: true,
  parameterCount: 2,
  showParameterBar: true,
  onToggleParameterBar: vi.fn(),
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
  hasParameters: true,
  parameterCount: 2,
  showParameterBar: true,
  onToggleParameterBar: vi.fn(),
  isAdmin: true,
  isPublic: true,
  onTogglePublic: vi.fn(),
  isSaving: false,
  onAddWidget: vi.fn(),
  onSave: vi.fn(),
  onLeave: vi.fn(),
  onDashboards: vi.fn(),
};

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

    const crumbs = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(
      within(crumbs).getByRole("link", { name: "Dashboards" }),
    ).toHaveAttribute("href", "/");
    expect(crumbs).toHaveTextContent("Movie Analytics");
    expect(
      screen.getByRole("heading", { level: 1, name: "Movie Analytics" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Updated/)).toHaveTextContent(
      /Updated .* by Alice Demo · 12 widgets/,
    );
    expect(screen.getByTestId("auto-refresh-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("tabs")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Back/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("keeps the Filters toggle, with the active count, beside the actions", async () => {
    const onToggleParameterBar = vi.fn();
    render(
      <DashboardViewToolbar
        {...viewProps}
        onToggleParameterBar={onToggleParameterBar}
      />,
    );
    const toggle = screen.getByRole("button", { name: "Hide parameters" });
    expect(toggle).toHaveTextContent("Filters2");
    await userEvent.click(toggle);
    expect(onToggleParameterBar).toHaveBeenCalledOnce();
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
});

describe("DashboardEditToolbar", () => {
  it("shows breadcrumb, Editing title, meta and the edit actions", async () => {
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
      screen.getByRole("heading", {
        level: 1,
        name: "Editing: Movie Analytics",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Updated/)).toHaveTextContent("· 1 widget");
    expect(screen.getByRole("button", { name: /Sharing/ })).toBeInTheDocument();
    expect(screen.getByTestId("tabs")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Back/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Add Widget/ }));
    await userEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(onAddWidget).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("leaves edit mode through the dashboard's crumb", async () => {
    const onLeave = vi.fn();
    render(<DashboardEditToolbar {...editProps} onLeave={onLeave} />);

    const crumbs = screen.getByRole("navigation", { name: "breadcrumb" });
    await userEvent.click(
      within(crumbs).getByRole("link", { name: "Movie Analytics" }),
    );
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("asks before leaving for the list: the Dashboards crumb calls onDashboards", async () => {
    const onDashboards = vi.fn();
    render(<DashboardEditToolbar {...editProps} onDashboards={onDashboards} />);
    await userEvent.click(screen.getByRole("link", { name: "Dashboards" }));
    expect(onDashboards).toHaveBeenCalledOnce();
  });

  it("hides Sharing from non-admins", () => {
    render(<DashboardEditToolbar {...editProps} isAdmin={false} />);
    expect(screen.queryByRole("button", { name: /Sharing/ })).toBeNull();
  });
});
