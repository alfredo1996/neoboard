import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import type { DashboardListItem } from "@/hooks/use-dashboards";

const { mockToast, connectorsQuery } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  // Reassigned per test: the import has to tell "still loading" from
  // "nothing installed speaks Cypher" (#1900).
  connectorsQuery: {
    data: [] as unknown,
    refetch: vi.fn(async () => ({ data: undefined as unknown })),
  },
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
const mockDelete = vi.fn();
let dashboards = [DASHBOARD];
beforeEach(() => {
  dashboards = [DASHBOARD];
});

vi.mock("@/hooks/use-dashboards", () => ({
  useDashboards: () => ({ data: dashboards, isLoading: false }),
  useCreateDashboard: () => idle,
  useDeleteDashboard: () => ({ ...idle, mutate: mockDelete }),
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
    PageHeader: ({
      title,
      titleRef,
    }: {
      title: string;
      titleRef?: React.Ref<HTMLHeadingElement>;
    }) => (
      <h1 ref={titleRef} tabIndex={-1}>
        {title}
      </h1>
    ),
    // Hands focus back after the render that closes it, as Radix does.
    ConfirmDialog: function ConfirmDialog({
      open,
      onOpenChange,
      onConfirm,
      confirmText,
      returnFocusTo,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onConfirm: () => void;
      confirmText: string;
      returnFocusTo?: HTMLElement | null;
    }) {
      const wasOpen = React.useRef(open);
      React.useEffect(() => {
        if (wasOpen.current && !open) returnFocusTo?.focus();
        wasOpen.current = open;
      });
      return open ? (
        <div role="alertdialog">
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
      ) : null;
    },
    useToast: () => ({ toast: mockToast }),
    focusedMenuTrigger: () => menuTrigger,
  };
});

import DashboardListPage from "../page";

// What `focusedMenuTrigger()` finds: the card's "Dashboard options" button.
const menuTrigger = document.body.appendChild(document.createElement("button"));

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

describe("DashboardListPage rename", () => {
  it("submits the trimmed new name for the dashboard picked (#1045)", () => {
    dashboards = [{ ...DASHBOARD, role: "owner" }];
    render(<DashboardListPage />);
    fireEvent.click(screen.getByText("Rename"));
    fireEvent.change(document.getElementById("dashboard-rename")!, {
      target: { value: "  Box Office  " },
    });
    fireEvent.submit(document.getElementById("dashboard-rename")!);
    expect(idle.mutateAsync).toHaveBeenCalledWith({
      id: "d1",
      name: "Box Office",
    });
  });
});

describe("DashboardListPage create — the name hint", () => {
  it("refuses an empty name, then warns without blocking on a taken one (#1048)", () => {
    render(<DashboardListPage />);
    const input = document.getElementById("dashboard-name")!;

    fireEvent.submit(input);
    expect(screen.getByText("Name is required").id).toBe(
      "dashboard-name-error",
    );
    expect(input.getAttribute("aria-describedby")).toBe("dashboard-name-error");

    fireEvent.change(input, { target: { value: "Movie Analytics" } });
    expect(screen.queryByText("Name is required")).toBeNull();
    expect(
      screen.getByText(
        "A dashboard named “Movie Analytics” already exists. You can still create another with this name.",
      ),
    ).toBeTruthy();
  });
});

// #2108: the numeral's margin is not text; readers and copy need a space.
it.each(["1. Add a connection", "2. Create a dashboard", "3. Add widgets"])(
  "reads the getting-started step as %s",
  (title) => {
    dashboards = [];
    render(<DashboardListPage />);
    expect(screen.getByText((_, el) => el?.textContent === title)).toBeTruthy();
  },
);

/**
 * #1900: which connector can run a NeoDash dashboard is decided by the query
 * language it declares, not by its name. Two refusals fall out of that, and
 * only one of them is permanent — so they must not share a message.
 */
describe("DashboardListPage NeoDash import", () => {
  const NEODASH = { title: "Movies", pages: [{ reports: [{}, {}] }] };

  beforeEach(() => {
    connectorsQuery.data = [];
    // mockReset, not clearAllMocks: a queued once-value a test left unused
    // would answer the next test's fetch.
    connectorsQuery.refetch.mockReset();
    connectorsQuery.refetch.mockResolvedValue({ data: undefined });
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
    // configurable: a test may pick twice.
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    fireEvent.change(input);
  }

  // A file picked before /api/connectors answered used to be refused, and
  // the user had to pick it again (#2029). The pick waits for the list.
  it("keeps a file picked while the connectors load and reads it once they arrive", async () => {
    connectorsQuery.data = undefined;
    const list = [
      { type: "acme-graph", label: "Acme Graph", queryLanguage: "cypher" },
    ];
    // As React Query does: the cache holds the list before refetch resolves.
    connectorsQuery.refetch.mockImplementationOnce(async () => {
      connectorsQuery.data = list;
      return { data: list };
    });
    render(<DashboardListPage />);

    pickNeoDashFile();

    expect(
      await screen.findByText("No compatible Acme Graph connections", {
        exact: false,
      }),
    ).toBeTruthy();
    // Joins the fetch already in flight rather than starting another.
    expect(connectorsQuery.refetch).toHaveBeenCalledWith({
      cancelRefetch: false,
    });
    expect(screen.queryByText(/try the file again/i)).toBeNull();
  });

  // A second file picked while the first waits for the connectors is the
  // one the user chose; the first, resuming later, must not replace it.
  it("keeps the latest pick when an earlier one resumes after it", async () => {
    connectorsQuery.data = undefined;
    let release!: (value: { data: unknown }) => void;
    connectorsQuery.refetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(<DashboardListPage />);

    pickNeoDashFile();
    // The race: the first pick is inside the connectors fetch when the
    // second arrives.
    await vi.waitFor(() => expect(connectorsQuery.refetch).toHaveBeenCalled());
    pickNeoDashFile({
      formatVersion: 1,
      dashboard: { name: "Second pick" },
      connections: {},
      layout: { version: 2, pages: [] },
    });
    expect(await screen.findByText("Second pick")).toBeTruthy();

    const list = [
      { type: "acme-graph", label: "Acme Graph", queryLanguage: "cypher" },
    ];
    connectorsQuery.data = list;
    release({ data: list });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByText("Second pick")).toBeTruthy();
    expect(screen.queryByText("Movies")).toBeNull();
  });

  // Nor may an earlier pick that fails late put its error on the newer file.
  it("shows no error from an earlier pick that fails after a later one", async () => {
    render(<DashboardListPage />);
    const input = document.getElementById("import-file") as HTMLInputElement;
    let fail!: (reason: Error) => void;
    const first = new File(["x"], "first.json");
    Object.defineProperty(first, "text", {
      value: () =>
        new Promise<string>((_, reject) => {
          fail = reject;
        }),
    });
    Object.defineProperty(input, "files", {
      value: [first],
      configurable: true,
    });
    fireEvent.change(input);

    pickNeoDashFile({
      formatVersion: 1,
      dashboard: { name: "Second pick" },
      connections: {},
      layout: { version: 2, pages: [] },
    });
    expect(await screen.findByText("Second pick")).toBeTruthy();

    fail(new Error("read failed"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText(/Failed to parse file/)).toBeNull();
    expect(screen.getByText("Second pick")).toBeTruthy();
  });

  // Closing the dialog retires a pick still waiting on the connectors: it
  // must not fill a dialog the user has already dismissed.
  it("drops a pick still loading when the dialog is closed", async () => {
    connectorsQuery.data = undefined;
    let release!: (value: { data: unknown }) => void;
    connectorsQuery.refetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(<DashboardListPage />);

    pickNeoDashFile();
    await vi.waitFor(() => expect(connectorsQuery.refetch).toHaveBeenCalled());
    const form = document.getElementById("import-file")!.closest("form")!;
    fireEvent.click(within(form).getByText("Cancel"));

    const list = [
      { type: "acme-graph", label: "Acme Graph", queryLanguage: "cypher" },
    ];
    connectorsQuery.data = list;
    release({ data: list });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      screen.queryByText("No compatible Acme Graph connections", {
        exact: false,
      }),
    ).toBeNull();
  });

  it("says so when the connectors cannot be loaded", async () => {
    connectorsQuery.data = undefined;
    connectorsQuery.refetch.mockResolvedValueOnce({ data: undefined });
    render(<DashboardListPage />);

    pickNeoDashFile();

    expect(
      await screen.findByText(
        "Couldn't load the installed connectors, so this NeoDash file can't be read. Reload the page and try again.",
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

describe("DashboardListPage delete — where focus goes (#2086)", () => {
  beforeEach(() => {
    dashboards = [{ ...DASHBOARD, role: "owner" }];
    menuTrigger.blur();
  });

  it("Cancel puts focus back on the card's menu button", () => {
    render(<DashboardListPage />);

    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(menuTrigger).toHaveFocus();
  });

  it("a confirmed Delete puts focus on the page heading: the card is leaving", () => {
    render(<DashboardListPage />);

    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );

    expect(mockDelete).toHaveBeenCalledWith("d1", expect.anything());
    expect(screen.getByRole("heading", { name: "Dashboards" })).toHaveFocus();
  });
});
