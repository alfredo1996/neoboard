import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import type { DashboardListItem } from "@/hooks/use-dashboards";

const { mockToast, connectorsQuery } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  // Reassigned per test: the import has to tell "still loading" from
  // "nothing installed speaks Cypher" (#1900).
  connectorsQuery: { data: [] as unknown },
}));

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
  useConnectors: () => connectorsQuery,
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
    // A real input: the import flow is driven through its change event, so a
    // passthrough div would leave `handleFile` unreachable.
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
      <input {...props} />
    ),
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

/**
 * #1900: which connector can run a NeoDash dashboard is decided by the query
 * language it declares, not by its name. Two refusals fall out of that, and
 * only one of them is permanent — so they must not share a message.
 */
describe("DashboardListPage NeoDash import", () => {
  const NEODASH = { title: "Movies", pages: [{ reports: [{}, {}] }] };

  beforeEach(() => {
    connectorsQuery.data = [];
  });

  function pickNeoDashFile(dashboard: object = NEODASH) {
    // By id, not by label: `Label` is a passthrough div here, so there is no
    // htmlFor association for getByLabelText to follow.
    const input = document.getElementById("import-file") as HTMLInputElement;
    const text = JSON.stringify(dashboard);
    const file = new File([text], "neodash.json", {
      type: "application/json",
    });
    // jsdom's File.text() is unreliable across versions; the flow only needs
    // the text, so hand it over directly.
    Object.defineProperty(file, "text", { value: () => Promise.resolve(text) });
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
  }

  it("says to try again while the connectors are still loading", async () => {
    connectorsQuery.data = undefined;
    render(<DashboardListPage />);

    pickNeoDashFile();

    expect(
      await screen.findByText(
        "Still loading the installed connectors — try the file again in a moment.",
      ),
    ).toBeTruthy();
  });

  // The mapping card used to print the raw type under the placeholder and in
  // both "no connections" messages — `acme-graph`, where the descriptor says
  // `Acme Graph`. Same defect as the connections page's re-assign copy.
  it("names the connector by its label on the mapping card", async () => {
    connectorsQuery.data = [
      { type: "acme-graph", label: "Acme Graph", queryLanguage: "cypher" },
    ];
    render(<DashboardListPage />);

    pickNeoDashFile();

    expect(
      await screen.findByText("No compatible Acme Graph connections", {
        exact: false,
      }),
    ).toBeTruthy();
    expect(screen.getByText("No Acme Graph connections")).toBeTruthy();
    expect(screen.queryByText(/acme-graph/)).toBeNull();
  });

  it("refuses permanently when no installed connector speaks Cypher", async () => {
    connectorsQuery.data = [
      { type: "acme-sheets", label: "Acme Sheets", queryLanguage: "sql" },
    ];
    render(<DashboardListPage />);

    pickNeoDashFile();

    expect(
      await screen.findByText(/No installed connector runs Cypher/),
    ).toBeTruthy();
  });

  // #2013: the preview names the dashboard the import will create.
  it("previews a blank-titled file under the name it imports as", async () => {
    connectorsQuery.data = [
      { type: "acme-graph", label: "Acme Graph", queryLanguage: "cypher" },
    ];
    render(<DashboardListPage />);

    pickNeoDashFile({ ...NEODASH, title: "   " });

    expect(await screen.findByText("Imported Dashboard")).toBeTruthy();
  });
});
