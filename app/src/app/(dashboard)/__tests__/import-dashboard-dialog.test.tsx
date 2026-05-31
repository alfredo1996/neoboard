import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

/* ---------- mocks ---------- */

const mockPush = vi.fn();
const mockMutateAsync = vi.fn();
const mockUseConnections = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "loading" }),
}));

vi.mock("@/hooks/use-dashboards", () => ({
  useDashboards: () => ({ data: [], isLoading: false }),
  useCreateDashboard: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDashboard: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDuplicateDashboard: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportDashboard: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

vi.mock("@/hooks/use-connections", () => ({
  useConnections: () => mockUseConnections(),
}));

vi.mock("@neoboard/components", () => {
  const Dialog = ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div data-testid="dialog">{children}</div> : null);
  const passthrough =
    (testId: string) =>
    ({ children }: { children?: React.ReactNode }) => (
      <div data-testid={testId}>{children}</div>
    );
  return {
    Dialog,
    DialogContent: passthrough("dialog-content"),
    DialogHeader: passthrough("dialog-header"),
    DialogTitle: ({ children }: { children?: React.ReactNode }) => (
      <h2>{children}</h2>
    ),
    DialogFooter: passthrough("dialog-footer"),
    Label: ({
      children,
      htmlFor,
    }: {
      children: React.ReactNode;
      htmlFor?: string;
    }) => <label htmlFor={htmlFor}>{children}</label>,
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
      <input {...props} />
    ),
    Button: ({
      children,
      onClick,
      type,
      disabled,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      type?: "button" | "submit";
      disabled?: boolean;
    }) => (
      <button onClick={onClick} type={type} disabled={disabled}>
        {children}
      </button>
    ),
    LoadingButton: ({
      children,
      type,
      disabled,
    }: {
      children: React.ReactNode;
      type?: "button" | "submit";
      disabled?: boolean;
      loading?: boolean;
      loadingText?: string;
    }) => (
      <button type={type} disabled={disabled} data-testid="submit-button">
        {children}
      </button>
    ),
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value: string;
      onValueChange: (v: string) => void;
      children: React.ReactNode;
    }) => (
      <select
        data-testid="select"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        <option value="" />
        {children}
      </select>
    ),
    SelectTrigger: ({ id }: { id?: string; children?: React.ReactNode }) => (
      <span data-testid={`select-trigger-${id ?? "no-id"}`} />
    ),
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children: React.ReactNode;
    }) => <option value={value}>{children}</option>,
    Badge: passthrough("badge"),
    Card: passthrough("card"),
    CardContent: passthrough("card-content"),
    CardHeader: passthrough("card-header"),
    CardTitle: passthrough("card-title"),
    CardDescription: passthrough("card-description"),
    CardFooter: passthrough("card-footer"),
    DropdownMenu: passthrough("dropdown"),
    DropdownMenuContent: passthrough("dropdown-content"),
    DropdownMenuItem: passthrough("dropdown-item"),
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuTrigger: passthrough("dropdown-trigger"),
    PageHeader: passthrough("page-header"),
    EmptyState: passthrough("empty-state"),
    LoadingOverlay: passthrough("loading-overlay"),
    ConfirmDialog: () => null,
    TimeAgo: () => null,
    DashboardMiniPreview: () => null,
    useToast: () => ({ toast: vi.fn() }),
  };
});

/* ---------- helpers ---------- */

function makeFile(json: unknown): File {
  return new File([JSON.stringify(json)], "dash.json", {
    type: "application/json",
  });
}

const NEODASH_PAYLOAD = {
  title: "NeoDash Dashboard",
  version: "2.4",
  pages: [
    {
      title: "Page 1",
      reports: [
        {
          id: "r1",
          title: "Table",
          type: "table",
          query: "MATCH (n) RETURN n",
          x: 0,
          y: 0,
          width: 6,
          height: 4,
          settings: {},
          parameters: {},
        },
      ],
    },
  ],
};

/* ---------- import under test ---------- */
import { ImportDashboardDialog } from "../import-dashboard-dialog";

/* ---------- tests ---------- */

describe("ImportDashboardDialog — NeoDash connection picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function uploadNeoDash() {
    const input = screen.getByLabelText(
      "Dashboard file (.json)",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile(NEODASH_PAYLOAD)] } });
    await waitFor(() =>
      expect(screen.getByText(/NeoDash format/)).toBeDefined(),
    );
  }

  it("shows an empty-state link when there are no Neo4j connections", async () => {
    mockUseConnections.mockReturnValue({ data: [] });
    render(<ImportDashboardDialog open onOpenChange={() => {}} />);

    await uploadNeoDash();

    expect(screen.getByText(/don't have a Neo4j connection/i)).toBeDefined();
    const link = screen.getByRole("link", { name: /add a connection/i });
    expect(link.getAttribute("href")).toBe("/connections");
    expect(
      (screen.getByTestId("submit-button") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("pre-selects the only Neo4j connection and enables submit", async () => {
    mockUseConnections.mockReturnValue({
      data: [{ id: "neo4j-1", name: "Prod Neo4j", type: "neo4j" }],
    });
    render(<ImportDashboardDialog open onOpenChange={() => {}} />);

    await uploadNeoDash();

    const select = screen.getByTestId("select") as HTMLSelectElement;
    expect(select.value).toBe("neo4j-1");
    expect(
      (screen.getByTestId("submit-button") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("requires a manual pick when multiple Neo4j connections exist", async () => {
    mockUseConnections.mockReturnValue({
      data: [
        { id: "neo4j-1", name: "Prod", type: "neo4j" },
        { id: "neo4j-2", name: "Staging", type: "neo4j" },
      ],
    });
    render(<ImportDashboardDialog open onOpenChange={() => {}} />);

    await uploadNeoDash();

    const select = screen.getByTestId("select") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(
      (screen.getByTestId("submit-button") as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.change(select, { target: { value: "neo4j-2" } });
    expect(
      (screen.getByTestId("submit-button") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("hides Postgres connections from the picker (Neo4j only)", async () => {
    mockUseConnections.mockReturnValue({
      data: [
        { id: "pg-1", name: "Postgres", type: "postgres" },
        { id: "neo4j-1", name: "Neo4j Prod", type: "neo4j" },
      ],
    });
    render(<ImportDashboardDialog open onOpenChange={() => {}} />);

    await uploadNeoDash();

    expect(screen.queryByText("Postgres")).toBeNull();
    expect(screen.getByText("Neo4j Prod")).toBeDefined();
  });

  it("sends connectionMapping with empty-string key on submit", async () => {
    mockUseConnections.mockReturnValue({
      data: [{ id: "neo4j-1", name: "Prod", type: "neo4j" }],
    });
    mockMutateAsync.mockResolvedValue({ id: "new-dash" });
    render(<ImportDashboardDialog open onOpenChange={() => {}} />);

    await uploadNeoDash();

    fireEvent.click(screen.getByTestId("submit-button"));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    const arg = mockMutateAsync.mock.calls[0][0];
    expect(arg.connectionMapping).toEqual({ "": "neo4j-1" });
  });
});

describe("ImportDashboardDialog — multi-database NeoDash mapping", () => {
  const MULTI_DB_PAYLOAD = {
    title: "Multi-DB",
    version: "2.4",
    pages: [
      {
        title: "Page 1",
        reports: [
          {
            id: "r1",
            title: "Movies",
            type: "table",
            query: "MATCH (m:Movie) RETURN m",
            database: "movies",
            x: 0,
            y: 0,
            width: 6,
            height: 4,
            settings: {},
            parameters: {},
          },
          {
            id: "r2",
            title: "Tenants",
            type: "bar",
            query: "MATCH (t) RETURN t",
            database: "tenants",
            x: 6,
            y: 0,
            width: 6,
            height: 4,
            settings: {},
            parameters: {},
          },
        ],
      },
    ],
  };

  async function uploadMultiDb() {
    const input = screen.getByLabelText(
      "Dashboard file (.json)",
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [makeFile(MULTI_DB_PAYLOAD)] },
    });
    await waitFor(() =>
      expect(screen.getByText(/NeoDash format/)).toBeDefined(),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders one picker row per distinct NeoDash database", async () => {
    mockUseConnections.mockReturnValue({
      data: [{ id: "neo4j-1", name: "Neo4j", type: "neo4j" }],
    });
    render(<ImportDashboardDialog open onOpenChange={() => {}} />);

    await uploadMultiDb();

    expect(screen.getByText("movies")).toBeDefined();
    expect(screen.getByText("tenants")).toBeDefined();
    expect(screen.getAllByTestId("select")).toHaveLength(2);
  });

  it("auto-picks each row when there is exactly one Neo4j connection", async () => {
    mockUseConnections.mockReturnValue({
      data: [{ id: "neo4j-1", name: "Neo4j", type: "neo4j" }],
    });
    mockMutateAsync.mockResolvedValue({ id: "new-dash" });
    render(<ImportDashboardDialog open onOpenChange={() => {}} />);

    await uploadMultiDb();

    const selects = screen.getAllByTestId("select") as HTMLSelectElement[];
    expect(selects[0].value).toBe("neo4j-1");
    expect(selects[1].value).toBe("neo4j-1");
    expect(
      (screen.getByTestId("submit-button") as HTMLButtonElement).disabled,
    ).toBe(false);

    fireEvent.click(screen.getByTestId("submit-button"));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    expect(mockMutateAsync.mock.calls[0][0].connectionMapping).toEqual({
      movies: "neo4j-1",
      tenants: "neo4j-1",
    });
  });

  it("keeps submit disabled until every database row has a connection", async () => {
    mockUseConnections.mockReturnValue({
      data: [
        { id: "neo4j-a", name: "Cluster A", type: "neo4j" },
        { id: "neo4j-b", name: "Cluster B", type: "neo4j" },
      ],
    });
    render(<ImportDashboardDialog open onOpenChange={() => {}} />);

    await uploadMultiDb();

    expect(
      (screen.getByTestId("submit-button") as HTMLButtonElement).disabled,
    ).toBe(true);

    const selects = screen.getAllByTestId("select") as HTMLSelectElement[];
    fireEvent.change(selects[0], { target: { value: "neo4j-a" } });
    expect(
      (screen.getByTestId("submit-button") as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.change(selects[1], { target: { value: "neo4j-b" } });
    expect(
      (screen.getByTestId("submit-button") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("submits per-database mapping so each widget can land on its own connection", async () => {
    mockUseConnections.mockReturnValue({
      data: [
        { id: "neo4j-a", name: "Cluster A", type: "neo4j" },
        { id: "neo4j-b", name: "Cluster B", type: "neo4j" },
      ],
    });
    mockMutateAsync.mockResolvedValue({ id: "new-dash" });
    render(<ImportDashboardDialog open onOpenChange={() => {}} />);

    await uploadMultiDb();

    const selects = screen.getAllByTestId("select") as HTMLSelectElement[];
    // "movies" is alphabetically first → row 0
    fireEvent.change(selects[0], { target: { value: "neo4j-a" } });
    fireEvent.change(selects[1], { target: { value: "neo4j-b" } });

    fireEvent.click(screen.getByTestId("submit-button"));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    expect(mockMutateAsync.mock.calls[0][0].connectionMapping).toEqual({
      movies: "neo4j-a",
      tenants: "neo4j-b",
    });
  });
});
