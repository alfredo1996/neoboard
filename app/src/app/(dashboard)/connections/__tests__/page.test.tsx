import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { QueueFullError } from "@/lib/api/api-client";
import { useConnectionStatusStore } from "@/stores/connection-status-store";

/**
 * #1426 — the Connections page opens no database connection on arrival.
 *
 * It used to test every connection on mount: N concurrent probes, each
 * decrypting a credential and dialling a real database, because someone
 * opened a settings page. Now a connection is "Not checked" until the user
 * asks, per row or with "Test all", which probes three at a time.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  name: string;
  type: string;
  visibility: "private" | "shared";
  isOwner: boolean;
}

let mockRole = "creator";
let mockConnections: Row[] = [];

// What GET /api/connectors serves (#1899). Fixture connectors only: the page
// must work for a connector nothing in app/ has heard of.
const ICON = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
const INSTALLED = [
  { type: "any", label: "Any", category: "database", fields: [] },
  {
    type: "acme-sheets",
    label: "Acme Sheets",
    category: "file",
    iconSvg: ICON,
    fields: [
      {
        key: "uri",
        label: "Workbook",
        type: "uri",
        group: "connection",
        placeholder: "acme://host/book",
        protocols: ["acme:"],
      },
      {
        key: "pageSize",
        label: "Page Size",
        type: "number",
        group: "advanced",
      },
    ],
  },
];
let mockConnectors: {
  data: typeof INSTALLED | undefined;
  isLoading: boolean;
  isError: boolean;
};
const mockRefetch = vi.fn();
const mockTest = vi.fn();
const mockTestInline = vi.fn();
const mockToast = vi.fn();
const mockUpdate = vi.fn();
const mockConnectionConfig = vi.fn();

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: mockRole } } }),
}));

vi.mock("@/hooks/use-connections", () => {
  const idle = () => ({
    mutateAsync: vi.fn(),
    mutate: vi.fn(),
    isPending: false,
  });
  return {
    useConnections: () => ({ data: mockConnections, isLoading: false }),
    useConnectionUsage: () => ({ data: undefined, isLoading: false }),
    // What the edit and Duplicate dialogs pre-fill from (#1901).
    useConnectionConfig: (id?: string) => ({
      data: mockConnectionConfig(id),
      isLoading: false,
    }),
    useCreateConnection: idle,
    useUpdateConnection: () => ({ ...idle(), mutateAsync: mockUpdate }),
    useDeleteConnection: idle,
    useReassignConnection: idle,
    useTestInlineConnection: () => ({ ...idle(), mutateAsync: mockTestInline }),
    useTestConnection: () => ({ mutateAsync: mockTest }),
  };
});

vi.mock("@/hooks/use-connectors", () => {
  const useConnectors = () => ({ ...mockConnectors, refetch: mockRefetch });
  return {
    useConnectors,
    useConnector: (type?: string | null) =>
      mockConnectors.data?.find((c) => c.type === type),
  };
});

vi.mock("@neoboard/components", () => {
  const Box = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  const Button = ({
    children,
    onClick,
    disabled,
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
  return {
    Button,
    LoadingButton: Button,
    Input: ({ id, placeholder }: { id?: string; placeholder?: string }) => (
      <input id={id} placeholder={placeholder} />
    ),
    Label: Box,
    Switch: () => null,
    Skeleton: () => <div data-testid="skeleton" />,
    PasswordInput: () => null,
    // The form renders this once per group (name, connection, advanced,
    // advanced booleans, maxRows), so the fill button is keyed by the first
    // field it was handed — a fixed id matched five elements. It fills the
    // fields it was GIVEN: naming uri/username/password here would be this
    // suite asserting a built-in connector's shape (#1901).
    DynamicConnectionFields: ({
      fields,
      onChange,
    }: {
      fields: { name: string; label: string; placeholder?: string }[];
      onChange: (name: string, value: string) => void;
    }) => (
      <>
        <ul data-testid="connection-fields">
          {fields.map((f) => (
            <li key={f.label}>{f.label}</li>
          ))}
        </ul>
        <button
          data-testid={`fill-${fields[0]?.name ?? "none"}`}
          // The field's own placeholder, so a value satisfies whatever the
          // connector declared — a literal "typed" fails a uri field with
          // protocols, and the form then refuses to submit.
          onClick={() =>
            fields.forEach((f) => onChange(f.name, f.placeholder ?? "typed"))
          }
        />
      </>
    ),
    ConfirmDialog: () => null,
    Dialog: ({
      open,
      children,
    }: {
      open: boolean;
      children: React.ReactNode;
    }) => (open ? <div role="dialog">{children}</div> : null),
    DialogContent: Box,
    DialogHeader: Box,
    DialogTitle: Box,
    DialogDescription: Box,
    DialogFooter: Box,
    Alert: Box,
    AlertDescription: Box,
    EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
    LoadingOverlay: Box,
    PageHeader: ({
      title,
      actions,
    }: {
      title: string;
      actions: React.ReactNode;
    }) => (
      <header>
        <h1>{title}</h1>
        {actions}
      </header>
    ),
    ConnectionCard: ({
      name,
      host,
      icon,
      status,
      onTest,
      onEdit,
      onDuplicate,
      onDelete,
    }: {
      name: string;
      host: string;
      icon: React.ReactNode;
      status: string;
      onTest?: () => void;
      onEdit?: () => void;
      onDuplicate?: () => void;
      onDelete?: () => void;
    }) => (
      <div data-testid={`card-${name}`}>
        <span data-testid="icon">{icon}</span>
        <span>{name}</span>
        <span data-testid="host">{host}</span>
        <span data-testid="status">{status}</span>
        {onTest && <button onClick={onTest}>Test {name}</button>}
        {onEdit && <button onClick={onEdit}>Edit {name}</button>}
        {onDuplicate && <button onClick={onDuplicate}>Duplicate {name}</button>}
        {onDelete && <button onClick={onDelete}>Delete {name}</button>}
      </div>
    ),
    useToast: () => ({ toast: mockToast }),
  };
});

import ConnectionsPage from "../page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rows(count: number, over: Partial<Row> = {}): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i + 1}`,
    name: `conn-${i + 1}`,
    type: "any",
    visibility: "private" as const,
    isOwner: true,
    ...over,
  }));
}

/** Probes the test settles by hand, keyed by connection id. */
function manualProbes() {
  const settle = new Map<string, (result: unknown) => void>();
  const fail = new Map<string, (error: unknown) => void>();
  mockTest.mockImplementation(
    ({ id }: { id: string }) =>
      new Promise((resolve, reject) => {
        settle.set(id, resolve);
        fail.set(id, reject);
      }),
  );
  return { settle, fail };
}

const statusOf = (name: string) =>
  within(screen.getByTestId(`card-${name}`)).getByTestId("status").textContent;

/** The labels of every field the dialog renders, in order. */
const fieldGroups = (dialog: ReturnType<typeof within>) =>
  dialog.getAllByTestId("connection-fields").flatMap((group: HTMLElement) =>
    within(group)
      .queryAllByRole("listitem")
      .map((item) => item.textContent),
  );

const flush = () => act(async () => {});

beforeEach(() => {
  vi.resetAllMocks();
  mockRole = "creator";
  mockConnections = [];
  mockConnectors = { data: INSTALLED, isLoading: false, isError: false };
  useConnectionStatusStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConnectionsPage — arrival (#1426)", () => {
  it("issues zero test requests on mount, however many connections there are", async () => {
    mockConnections = rows(12);
    render(<ConnectionsPage />);
    await flush();

    expect(mockTest).not.toHaveBeenCalled();
    for (const c of mockConnections) {
      expect(statusOf(c.name)).toBe("unknown");
    }
  });

  it("does not test on a revisit either", async () => {
    mockConnections = rows(3);
    const first = render(<ConnectionsPage />);
    first.unmount();
    render(<ConnectionsPage />);
    await flush();
    expect(mockTest).not.toHaveBeenCalled();
  });

  it("offers Test all, enabled, without being asked", () => {
    mockConnections = rows(2);
    render(<ConnectionsPage />);
    expect(screen.getByRole("button", { name: "Test all" })).toBeEnabled();
  });

  it("offers no Test all when nothing on the page is the user's to probe", () => {
    mockConnections = rows(2, { isOwner: false, visibility: "shared" });
    render(<ConnectionsPage />);
    expect(screen.queryByRole("button", { name: "Test all" })).toBeNull();
  });
});

describe("ConnectionsPage — single Test (#1426)", () => {
  it("probes that one connection, as an interactive request", async () => {
    mockConnections = rows(3);
    mockTest.mockResolvedValue({ success: true });
    render(<ConnectionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Test conn-2" }));
    await flush();

    expect(mockTest).toHaveBeenCalledExactlyOnceWith({ id: "c2" });
    expect(statusOf("conn-2")).toBe("connected");
    expect(statusOf("conn-1")).toBe("unknown");
  });

  it("says the server is busy — not that the connection failed — on backpressure", async () => {
    mockConnections = rows(1);
    mockTest.mockRejectedValue(new QueueFullError("queue full", 2000));
    render(<ConnectionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Test conn-1" }));
    await flush();

    expect(statusOf("conn-1")).toBe("unknown");
    expect(mockToast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ title: "Server busy" }),
    );
  });

  it("keeps a verdict it already had when a re-test is turned away", async () => {
    mockConnections = rows(1);
    useConnectionStatusStore.getState().setStatus("c1", "error", "refused");
    mockTest.mockRejectedValue(new QueueFullError("queue full", 2000));
    render(<ConnectionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Test conn-1" }));
    await flush();

    // A busy server is no information: it must not erase what was known.
    expect(statusOf("conn-1")).toBe("error");
    expect(useConnectionStatusStore.getState().getError("c1")).toBe("refused");
  });

  it("still reports any other failure as an error", async () => {
    mockConnections = rows(1);
    mockTest.mockRejectedValue(new Error("Not found"));
    render(<ConnectionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Test conn-1" }));
    await flush();

    expect(statusOf("conn-1")).toBe("error");
    expect(mockToast).not.toHaveBeenCalled();
  });
});

describe("ConnectionsPage — Test all (#1426)", () => {
  it("probes only what the user may probe: owned connections, not shared ones (#1545)", async () => {
    mockConnections = [
      ...rows(2),
      { ...rows(1)[0], id: "s1", name: "shared-1", isOwner: false },
      { ...rows(1)[0], id: "s2", name: "shared-2", isOwner: false },
    ];
    mockTest.mockResolvedValue({ success: true });
    render(<ConnectionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Test all" }));
    await flush();

    expect(mockTest.mock.calls.map(([input]) => input)).toEqual([
      { id: "c1", batch: true },
      { id: "c2", batch: true },
    ]);
    expect(statusOf("shared-1")).toBe("unknown");
    expect(statusOf("shared-2")).toBe("unknown");
  });

  it("probes every connection for an admin", async () => {
    mockRole = "admin";
    mockConnections = [
      ...rows(1),
      { ...rows(1)[0], id: "o1", name: "other-1", isOwner: false },
    ];
    mockTest.mockResolvedValue({ success: true });
    render(<ConnectionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Test all" }));
    await flush();

    expect(mockTest.mock.calls.map(([input]) => input.id)).toEqual([
      "c1",
      "o1",
    ]);
  });

  it("runs three at a time, updates each row as its result lands, and shows progress", async () => {
    mockConnections = rows(7);
    const { settle } = manualProbes();
    render(<ConnectionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Test all" }));
    await flush();

    // Three in flight, never seven.
    expect(mockTest).toHaveBeenCalledTimes(3);
    const running = screen.getByRole("button", { name: /Tested 0 of 7/ });
    expect(running).toBeDisabled();
    expect(statusOf("conn-1")).toBe("connecting");
    expect(statusOf("conn-4")).toBe("unknown");

    // conn-1 hangs. Its neighbours land, their rows update at once, and the
    // freed slots go to the next two — the hang holds one slot, not the run.
    await act(async () => {
      settle.get("c2")!({ success: true });
      settle.get("c3")!({ success: false, error: "refused" });
    });
    expect(statusOf("conn-2")).toBe("connected");
    expect(statusOf("conn-3")).toBe("error");
    expect(statusOf("conn-1")).toBe("connecting");
    expect(mockTest).toHaveBeenCalledTimes(5);
    expect(
      screen.getByRole("button", { name: /Tested 2 of 7/ }),
    ).toBeDisabled();

    await act(async () => {
      for (const id of ["c4", "c5"]) settle.get(id)!({ success: true });
    });
    await act(async () => {
      for (const id of ["c6", "c7", "c1"]) settle.get(id)!({ success: true });
    });

    expect(mockTest).toHaveBeenCalledTimes(7);
    expect(screen.getByRole("button", { name: "Test all" })).toBeEnabled();
    for (const c of mockConnections) {
      expect(statusOf(c.name)).toMatch(/connected|error/);
    }
  });

  it("reports busy once for the whole run, and leaves those rows unchecked", async () => {
    mockConnections = rows(4);
    mockTest.mockImplementation(({ id }: { id: string }) =>
      id === "c1" || id === "c3"
        ? Promise.reject(new QueueFullError("queue full", 2000))
        : Promise.resolve({ success: true }),
    );
    render(<ConnectionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Test all" }));
    await flush();

    expect(statusOf("conn-1")).toBe("unknown");
    expect(statusOf("conn-2")).toBe("connected");
    expect(statusOf("conn-3")).toBe("unknown");
    expect(mockToast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: "Server busy",
        description: expect.stringContaining("2 connections"),
      }),
    );
  });
});

describe("ConnectionsPage — connector facts come from the descriptors (#1899)", () => {
  const card = (name: string) => within(screen.getByTestId(`card-${name}`));

  it("draws each card's icon from its connector's descriptor", () => {
    mockConnections = [
      ...rows(1, { name: "sheets", type: "acme-sheets" }),
      { ...rows(1)[0], id: "c2", name: "plain" },
    ];
    render(<ConnectionsPage />);
    expect(
      card("sheets").getByTestId("icon").querySelector("img"),
    ).toHaveAttribute(
      "src",
      "data:image/svg+xml;utf8," + encodeURIComponent(ICON),
    );
    // No iconSvg: the generic glyph of its category.
    const plain = card("plain").getByTestId("icon");
    expect(plain.querySelector("img")).toBeNull();
    expect(plain.querySelector("svg.lucide")).not.toBeNull();
  });

  it("a connection whose connector is not installed says so, and can only be deleted", () => {
    mockConnections = rows(1, { name: "orphan", type: "uninstalled" });
    render(<ConnectionsPage />);

    expect(card("orphan").getByTestId("host")).toHaveTextContent(
      "uninstalled — connector not installed",
    );
    expect(
      card("orphan").getByTestId("icon").querySelector("svg.lucide"),
    ).not.toBeNull();
    expect(card("orphan").queryByRole("button", { name: /^Test/ })).toBeNull();
    expect(card("orphan").queryByRole("button", { name: /^Edit/ })).toBeNull();
    expect(
      card("orphan").queryByRole("button", { name: /^Duplicate/ }),
    ).toBeNull();
    expect(
      card("orphan").getByRole("button", { name: "Delete orphan" }),
    ).toBeEnabled();
  });

  it("leaves a not-installed connection out of Test all", async () => {
    mockConnections = [
      ...rows(1),
      { ...rows(1)[0], id: "gone", name: "orphan", type: "uninstalled" },
    ];
    mockTest.mockResolvedValue({ success: true });
    render(<ConnectionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Test all" }));
    await flush();

    expect(mockTest.mock.calls.map(([input]) => input.id)).toEqual(["c1"]);
  });

  it("passes no verdict before the descriptors arrive, or when they cannot be loaded", () => {
    mockConnections = rows(1, { type: "uninstalled" });
    mockConnectors = { data: undefined, isLoading: false, isError: true };
    render(<ConnectionsPage />);

    expect(card("conn-1").getByTestId("host")).toHaveTextContent(
      /^uninstalled$/,
    );
    expect(
      card("conn-1").getByRole("button", { name: "Test conn-1" }),
    ).toBeEnabled();
  });

  it("builds the type picker, the dialog title and the form from the picked connector", () => {
    render(<ConnectionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Connection" }));

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Choose Connection Type")).toBeInTheDocument();
    fireEvent.click(dialog.getByTestId("pick-acme-sheets"));

    expect(dialog.getByText("New Acme Sheets Connection")).toBeInTheDocument();
    // The app's name field, then the descriptor's `connection` group; the
    // advanced group waits inside its collapsed section (#1901).
    expect(fieldGroups(dialog)).toEqual(["Name", "Workbook"]);
  });

  // #1903: the app has no example of its own to offer — it would be an example
  // of some connector it is not supposed to know.
  it("a failed Test's hint carries the picked connector's own example", async () => {
    mockTestInline.mockResolvedValue({
      success: false,
      code: "bad_uri",
      error: "rejected",
    });
    render(<ConnectionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Connection" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByTestId("pick-acme-sheets"));
    // This suite's own installed connector declares one connection field,
    // "uri" — the fill button is keyed by it, not by a built-in's key.
    fireEvent.click(dialog.getByTestId("fill-uri"));

    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Test Connection" }));
    });

    expect(mockTestInline).toHaveBeenCalledOnce();
    expect(dialog.getByText("rejected")).toBeInTheDocument();
    expect(dialog.getByText(/acme:\/\/host\/book/)).toBeInTheDocument();
  });

  it("shows an error with a retry when the connectors cannot be loaded — no fallback type", () => {
    mockConnectors = { data: undefined, isLoading: false, isError: true };
    render(<ConnectionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Connection" }));

    const dialog = within(screen.getByRole("dialog"));
    expect(
      dialog.getByText(/could not load the available connectors/i),
    ).toBeInTheDocument();
    expect(dialog.queryByTestId(/^pick-/)).toBeNull();

    fireEvent.click(dialog.getByRole("button", { name: "Retry" }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("edits through the same generated form, pre-filled from that connection's stored config", () => {
    mockConnections = rows(1, { name: "sheets", type: "acme-sheets" });
    render(<ConnectionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Edit sheets" }));

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Edit sheets")).toBeInTheDocument();
    expect(mockConnectionConfig).toHaveBeenCalledWith("c1");
    // Edit opens with the advanced section — the descriptor's group and the
    // app's own row cap — already showing.
    expect(fieldGroups(dialog)).toEqual([
      "Name",
      "Workbook",
      "Page Size",
      "Max Rows per Query",
    ]);
  });

  it("duplicates into a new connection of the source's type, pre-filled from it", () => {
    mockConnections = rows(1, { name: "sheets", type: "acme-sheets" });
    render(<ConnectionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Duplicate sheets" }));

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("New Acme Sheets Connection")).toBeInTheDocument();
    expect(mockConnectionConfig).toHaveBeenCalledWith("c1");
  });

  it("after a save: closes the dialog, says so, and tests that one connection", async () => {
    mockConnections = rows(1, { name: "sheets", type: "acme-sheets" });
    mockUpdate.mockResolvedValue({ id: "c1" });
    mockTest.mockResolvedValue({ success: true });
    render(<ConnectionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Edit sheets" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await flush();

    expect(mockUpdate).toHaveBeenCalledExactlyOnceWith({
      id: "c1",
      name: "sheets",
      config: {},
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockToast).toHaveBeenCalledWith({ title: "Connection updated" });
    expect(mockTest).toHaveBeenCalledExactlyOnceWith({ id: "c1" });
    expect(statusOf("sheets")).toBe("connected");
  });
});
