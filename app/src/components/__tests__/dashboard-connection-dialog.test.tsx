import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import type { DashboardDetail } from "@/hooks/use-dashboards";
import type { ConnectionListItem } from "@/hooks/use-connections";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockDashboard: Partial<DashboardDetail> | undefined;
let mockConnections: ConnectionListItem[] = [];
const mockMutateAsync = vi.fn();

vi.mock("@/hooks/use-dashboards", () => ({
  useDashboard: (id: string) => ({
    data: id ? mockDashboard : undefined,
    isLoading: false,
  }),
  useReassignDashboardConnection: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

vi.mock("@/hooks/use-connections", () => ({
  useConnections: () => ({ data: mockConnections, isLoading: false }),
}));

vi.mock("@neoboard/components", () => ({
  Alert: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  AlertDescription: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  Button: ({
    children,
    ...p
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...p}>{children}</button>
  ),
  Dialog: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
  Label: ({
    children,
    ...p
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <label {...p}>{children}</label>
  ),
  LoadingButton: ({
    children,
    ...p
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...p}>{children}</button>
  ),
  // Minimal radio stand-in: a real <input type="radio"> per item so the test
  // drives selection the way a user does.
  RadioGroup: ({
    children,
    onValueChange,
  }: React.PropsWithChildren<{ onValueChange: (v: string) => void }>) => (
    <div
      data-testid="source-group"
      onChange={(e) =>
        onValueChange((e.target as HTMLInputElement).value ?? "")
      }
    >
      {children}
    </div>
  ),
  RadioGroupItem: ({ value, id }: { value: string; id: string }) => (
    <input type="radio" name="source" value={value} id={id} />
  ),
}));

import { DashboardConnectionDialog } from "../dashboard-connection-dialog";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NEO: ConnectionListItem = {
  id: "neo-1",
  name: "Neo4j Prod",
  type: "neo4j",
  allowPerCardDb: false,
  visibility: "private",
  isOwner: true,
  createdAt: "",
  updatedAt: "",
};
const NEO_2: ConnectionListItem = {
  ...NEO,
  id: "neo-2",
  name: "Neo4j Staging",
};
const PG: ConnectionListItem = {
  ...NEO,
  id: "pg-1",
  name: "Postgres Prod",
  type: "postgresql",
};

function widget(over: Record<string, unknown>) {
  return {
    id: "w",
    chartType: "bar",
    connectionId: "neo-1",
    query: "",
    ...over,
  };
}

function layout(widgets: Array<Record<string, unknown>>) {
  return {
    version: 2 as const,
    pages: [{ id: "p1", title: "Page 1", widgets, gridLayout: [] }],
  };
}

const props = {
  open: true,
  onOpenChange: vi.fn(),
  dashboardId: "d1",
  dashboardName: "Sales Overview",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderDialog = (over: Record<string, any> = {}) =>
  render(<DashboardConnectionDialog {...props} {...over} />);

beforeEach(() => {
  vi.clearAllMocks();
  mockConnections = [NEO, NEO_2, PG];
  mockDashboard = {
    layoutJson: layout([
      widget({ id: "w1" }),
      widget({ id: "w2" }),
      widget({ id: "w3", connectionId: "" }),
    ]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  mockMutateAsync.mockResolvedValue({
    dashboardsUpdated: 1,
    widgetsReassigned: 2,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DashboardConnectionDialog — source buckets", () => {
  it("lists each connection the dashboard uses with its widget count", () => {
    renderDialog();
    expect(screen.getByText("Neo4j Prod")).toBeInTheDocument();
    expect(screen.getByText("2 widgets")).toBeInTheDocument();
  });

  it("shows an Unassigned row for widgets with no connection", () => {
    renderDialog();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText("1 widget")).toBeInTheDocument();
  });

  // dashboard-export writes markdown/iframe widgets as connectionId:"" even
  // though they never wanted a connection, so counting them would invent work.
  it("excludes content-only widgets from every count", () => {
    mockDashboard = {
      layoutJson: layout([
        widget({ id: "w1" }),
        widget({ id: "md", chartType: "markdown", connectionId: "" }),
        widget({ id: "if", chartType: "iframe", connectionId: "" }),
      ]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    renderDialog();

    expect(screen.getByText("1 widget")).toBeInTheDocument();
    // No Unassigned row at all — the only "" widgets are content-only.
    expect(screen.queryByText("Unassigned")).not.toBeInTheDocument();
  });

  it("says so when the dashboard has no connection-backed widgets", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDashboard = { layoutJson: layout([]) } as any;
    renderDialog();
    expect(
      screen.getByText(/no widgets that use a connection/i),
    ).toBeInTheDocument();
  });

  it("stays inert while closed so the dashboard query is not fired", () => {
    renderDialog({ open: false, dashboardId: "" });
    expect(screen.queryByText("Change connection")).not.toBeInTheDocument();
  });
});

describe("DashboardConnectionDialog — target picker", () => {
  function pickSource(value: string) {
    const radio = document.querySelector(
      `input[type="radio"][value="${value}"]`,
    ) as HTMLInputElement;
    fireEvent.click(radio);
  }

  it("filters targets to the source's connector type and excludes the source", () => {
    renderDialog();
    pickSource("neo-1");

    const options = Array.from(
      document.querySelectorAll("#reassign-dashboard-target option"),
    ).map((o) => o.textContent);

    expect(options).toContain("Neo4j Staging (neo4j)");
    expect(options).not.toContain("Postgres Prod (postgresql)");
    expect(options.join()).not.toContain("Neo4j Prod");
  });

  // The original connector type is unrecoverable after an import that skipped
  // a connection, so nothing can be filtered on — offer everything.
  it("offers every connection for the Unassigned source", () => {
    renderDialog();
    pickSource("");

    const options = Array.from(
      document.querySelectorAll("#reassign-dashboard-target option"),
    ).map((o) => o.textContent);

    expect(options).toContain("Neo4j Prod (neo4j)");
    expect(options).toContain("Postgres Prod (postgresql)");
  });

  it("keeps the apply button disabled until a target is chosen", () => {
    renderDialog();
    const apply = screen.getByRole("button", { name: /change connection/i });
    expect(apply).toBeDisabled();

    pickSource("neo-1");
    expect(apply).toBeDisabled();

    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "neo-2" },
    });
    expect(apply).toBeEnabled();
  });

  it("reports when no compatible target exists", () => {
    mockConnections = [NEO, PG];
    renderDialog();
    pickSource("neo-1");
    expect(screen.getByText(/No other neo4j connections/i)).toBeInTheDocument();
  });

  it("names the widget count and the dashboard in the confirmation copy", () => {
    renderDialog();
    pickSource("neo-1");
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "neo-2" },
    });

    const confirm = screen.getByText(/This will change/i);
    expect(confirm).toHaveTextContent("2 widgets");
    expect(confirm).toHaveTextContent("Sales Overview");
  });
});

describe("DashboardConnectionDialog — applying", () => {
  function selectAndApply(source: string, target: string) {
    const radio = document.querySelector(
      `input[type="radio"][value="${source}"]`,
    ) as HTMLInputElement;
    fireEvent.click(radio);
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: target },
    });
    fireEvent.click(screen.getByRole("button", { name: /change connection/i }));
  }

  it("sends the dashboard-scoped reassign and reports the result", async () => {
    renderDialog();
    selectAndApply("neo-1", "neo-2");

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        dashboardId: "d1",
        fromConnectionId: "neo-1",
        targetConnectionId: "neo-2",
      }),
    );
    expect(
      await screen.findByText(/Moved 2 widgets to Neo4j Staging/i),
    ).toBeInTheDocument();
  });

  it("sends an empty source for the Unassigned bucket", async () => {
    renderDialog();
    selectAndApply("", "pg-1");

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        dashboardId: "d1",
        fromConnectionId: "",
        targetConnectionId: "pg-1",
      }),
    );
  });

  it("surfaces a server error inline instead of closing", async () => {
    mockMutateAsync.mockRejectedValue(
      new Error("Cannot re-assign to a neo4j connection"),
    );
    renderDialog();
    selectAndApply("neo-1", "neo-2");

    expect(
      await screen.findByText(/Cannot re-assign to a neo4j connection/i),
    ).toBeInTheDocument();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });
});
