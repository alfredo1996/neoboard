import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import type { DashboardListItem } from "@/hooks/use-dashboards";

const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }));

const DENIED =
  "This dashboard uses a connection you don't have access to, so it can't be duplicated";

const DASHBOARD: DashboardListItem = {
  id: "d1",
  name: "Movie Analytics",
  description: null,
  isPublic: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  updatedByName: null,
  role: "viewer",
  widgetCount: 3,
};

const idle = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };

vi.mock("@/hooks/use-dashboards", () => ({
  useDashboards: () => ({ data: [DASHBOARD], isLoading: false }),
  useCreateDashboard: () => idle,
  useDeleteDashboard: () => idle,
  useUpdateDashboard: () => idle,
  useImportDashboard: () => idle,
  // The server refuses the copy (#1816).
  useDuplicateDashboard: () => ({
    isPending: false,
    mutate: (_id: string, options?: { onError?: (err: Error) => void }) =>
      options?.onError?.(new Error(DENIED)),
  }),
}));

vi.mock("@/hooks/use-connections", () => ({
  useConnections: () => ({ data: [] }),
}));

// The NeoDash import asks the registry which connector speaks Cypher (#1900).
vi.mock("@/hooks/use-connectors", () => ({
  useConnectors: () => ({ data: [] }),
}));

vi.mock("@/components/dashboard-connection-dialog", () => ({
  DashboardConnectionDialog: () => null,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "creator" } } }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@neoboard/components", () => {
  // Each component renders its children and forwards a click: the page's
  // behaviour is under test, not the library's.
  const Passthrough = ({
    children,
    onClick,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
  }) => <div onClick={onClick}>{children}</div>;
  const names = [
    "Alert",
    "AlertDescription",
    "Badge",
    "Button",
    "Card",
    "CardDescription",
    "CardFooter",
    "CardHeader",
    "CardTitle",
    "Checkbox",
    "ConfirmDialog",
    "Dialog",
    "DialogContent",
    "DialogDescription",
    "DialogFooter",
    "DialogHeader",
    "DialogTitle",
    "DropdownMenu",
    "DropdownMenuContent",
    "DropdownMenuItem",
    "DropdownMenuSeparator",
    "DropdownMenuTrigger",
    "EmptyState",
    "Input",
    "Label",
    "LoadingButton",
    "LoadingOverlay",
    "PageHeader",
    "Select",
    "SelectContent",
    "SelectItem",
    "SelectTrigger",
    "SelectValue",
    "TimeAgo",
  ];
  return {
    ...Object.fromEntries(names.map((name) => [name, Passthrough])),
    useToast: () => ({ toast: mockToast }),
  };
});

import DashboardListPage from "../page";

describe("DashboardListPage duplicate", () => {
  it("shows the server's reason when a duplicate is refused (#1816)", () => {
    render(<DashboardListPage />);

    fireEvent.click(screen.getByText("Duplicate"));

    expect(mockToast).toHaveBeenCalledWith({
      title: "Failed to duplicate dashboard",
      description: DENIED,
      variant: "destructive",
    });
  });
});
