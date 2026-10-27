import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import type { DashboardListItem } from "@/hooks/use-dashboards";
import {
  MockClosingDialog,
  MockDialogContent,
  MockDialogOpen,
} from "@/__tests__/helpers/dialog-mocks";

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
  pageCount: 2,
};

const idle = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
const mockDelete = vi.fn();
let dashboards: DashboardListItem[] | undefined = [DASHBOARD];
let dashboardsLoading = false;
beforeEach(() => {
  dashboards = [DASHBOARD];
  dashboardsLoading = false;
});

vi.mock("@/hooks/use-dashboards", () => ({
  useDashboards: () => ({ data: dashboards, isLoading: dashboardsLoading }),
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

let connections: unknown[] = [];
vi.mock("@/hooks/use-connections", () => ({
  useConnections: () => ({ data: connections }),
}));

// The NeoDash import asks the registry which connector speaks Cypher (#1900).
vi.mock("@/hooks/use-connectors", () => ({
  useConnectors: () => connectorsQuery,
}));

vi.mock("@/components/dashboard-connection-dialog", () => ({
  DashboardConnectionDialog: MockClosingDialog,
}));

let sessionUser: { role: string; canWrite?: boolean } = { role: "creator" };
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: sessionUser } }),
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

vi.mock("@neoboard/components", async () => {
  const { FieldStub } = await import("@/__tests__/helpers/field-stub");
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
    "Tag",
    "Panel",
    "PanelDescription",
    "PanelFooter",
    "PanelHeader",
    "PanelTitle",
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
    Field: FieldStub,
    ...Object.fromEntries(names.map((name) => [name, Passthrough])),
    // Focusable, so a closing dialog can hand focus back to it (#2146).
    Button: ({
      children,
      onClick,
      "aria-label": label,
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      "aria-label"?: string;
    }) => (
      <div tabIndex={-1} onClick={onClick} aria-label={label}>
        {children}
      </div>
    ),
    // Still always rendered: the import tests pick a file without opening it.
    Dialog: ({
      open,
      children,
    }: {
      open: boolean;
      children?: React.ReactNode;
    }) => (
      <MockDialogOpen.Provider value={open}>{children}</MockDialogOpen.Provider>
    ),
    DialogContent: MockDialogContent,
    Checkbox: ({
      checked,
      onCheckedChange,
      ...rest
    }: {
      checked?: boolean;
      onCheckedChange?: (v: boolean) => void;
    } & React.InputHTMLAttributes<HTMLInputElement>) => (
      <input
        type="checkbox"
        aria-label={rest["aria-label"]}
        checked={!!checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
      />
    ),
    // A real input: the import flow is driven through its change event, so a
    // passthrough div would leave `handleFile` unreachable.
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
      <input {...props} />
    ),
    // Hands focus back after the render that closes it, as Radix does.
    ConfirmDialog: function ConfirmDialog({
      open,
      onOpenChange,
      onConfirm,
      action,
      object,
      name,
      consequences,
      returnFocusTo,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onConfirm: () => void;
      action: string;
      object?: string;
      name?: string;
      consequences?: React.ReactNode;
      returnFocusTo?: HTMLElement | null;
    }) {
      const wasOpen = React.useRef(open);
      React.useEffect(() => {
        if (wasOpen.current && !open) returnFocusTo?.focus();
        wasOpen.current = open;
      });
      return open ? (
        <div role="alertdialog" aria-label={`${action} ${name ?? ""}`.trim()}>
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
      ) : null;
    },
    useToast: () => ({ toast: mockToast }),
    focusedMenuTrigger: () => menuTrigger,
  };
});

import DashboardListPage from "../page";

// What `focusedMenuTrigger()` finds: the card's "Dashboard options" button.
const menuTrigger = document.body.appendChild(document.createElement("button"));

describe("DashboardListPage first load", () => {
  it("shows no empty state while the list is still loading (#2224)", () => {
    dashboards = undefined;
    dashboardsLoading = true;
    render(<DashboardListPage />);
    expect(screen.queryByText(/Welcome to NeoBoard/)).toBeNull();
    expect(screen.queryByText("No dashboards yet")).toBeNull();
  });
});

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
    expect(screen.getByText("Enter a name.").id).toBe("dashboard-name-error");
    expect(input.getAttribute("aria-describedby")).toBe("dashboard-name-error");

    fireEvent.change(input, { target: { value: "Movie Analytics" } });
    expect(screen.queryByText("Enter a name.")).toBeNull();
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

    fireEvent.click(screen.getByText("Delete…"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(menuTrigger).toHaveFocus();
  });

  it.each([
    [1, 1, 0, "Its 1 widget and 1 page go with it. This can't be undone."],
    [3, 2, 0, "Its 3 widgets and 2 pages go with it. This can't be undone."],
    [
      12,
      3,
      3,
      "Its 12 widgets and 3 pages go with it, and the 3 people it's shared with lose access. This can't be undone.",
    ],
    [
      2,
      1,
      1,
      "Its 2 widgets and 1 page go with it, and the 1 person it's shared with loses access. This can't be undone.",
    ],
    [0, 1, 0, "It has no widgets. This can't be undone."],
  ])(
    "a dashboard of %i widgets, %i pages, %i shares says: %s (#2223)",
    (widgetCount, pageCount, shareCount, text) => {
      dashboards = [
        { ...DASHBOARD, role: "owner", widgetCount, pageCount, shareCount },
      ];
      render(<DashboardListPage />);

      fireEvent.click(screen.getByText("Delete…"));

      expect(screen.getByRole("alertdialog")).toHaveTextContent(text);
    },
  );

  it("names the dashboard and what goes with it (#2223)", () => {
    render(<DashboardListPage />);

    fireEvent.click(screen.getByText("Delete…"));

    const dialog = screen.getByRole("alertdialog", {
      name: "Delete Movie Analytics",
    });
    expect(
      within(dialog).getByRole("button", { name: "Delete dashboard" }),
    ).toBeVisible();
  });

  it("a confirmed Delete puts focus on the page heading: the card is leaving", () => {
    render(<DashboardListPage />);

    fireEvent.click(screen.getByText("Delete…"));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete dashboard",
      }),
    );

    expect(mockDelete).toHaveBeenCalledWith("d1", expect.anything());
    expect(screen.getByRole("heading", { name: "Dashboards" })).toHaveFocus();
  });
});

// #2146: none of these dialogs has a Trigger either.
const cancelIn = (id: string) => () =>
  within(document.getElementById(id)!.closest("form")!).getByText("Cancel");
it.each([
  ["New dashboard", false, cancelIn("dashboard-name")],
  ["Import", false, cancelIn("import-file")],
  ["Rename", true, cancelIn("dashboard-rename")],
  [
    "Change connection…",
    true,
    () => screen.getByRole("button", { name: "Cancel" }),
  ],
])(
  "closing what %s opened puts focus back on its opener (#2146)",
  (name, fromMenu, cancel) => {
    dashboards = [{ ...DASHBOARD, role: "owner" }];
    menuTrigger.blur();
    render(<DashboardListPage />);
    const opener = screen.getAllByText(name)[0];

    fireEvent.click(opener);
    fireEvent.click(cancel());

    expect(fromMenu ? menuTrigger : opener).toHaveFocus();
  },
);

describe("DashboardListPage rows (#2253)", () => {
  const OWNED = {
    ...DASHBOARD,
    id: "d1",
    role: "owner" as const,
    ownerName: "Ada Owner",
  };
  const SHARED = {
    ...DASHBOARD,
    id: "d2",
    name: "Chart gallery",
    description: "One page per chart type",
    role: "viewer" as const,
    ownerName: "Bo Builder",
    shared: true,
    isPublic: true,
    widgetCount: 5,
  };
  beforeEach(() => {
    dashboards = [OWNED, SHARED];
    connections = [{ id: "c1" }, { id: "c2" }];
  });

  it("renders each dashboard as a row whose link opens it", () => {
    render(<DashboardListPage />);
    const row = screen.getByRole("row", { name: /Chart gallery/ });
    expect(
      within(row).getByRole("link", { name: "Chart gallery" }),
    ).toHaveAttribute("href", "/d2");
    expect(within(row).getByText("One page per chart type")).toBeVisible();
  });

  it("names the owner in the Owner column, whoever you are", () => {
    render(<DashboardListPage />);
    expect(
      screen.getByRole("columnheader", { name: "Owner" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("row", { name: /Chart gallery/ })).getByText(
        "Bo Builder",
      ),
    ).toBeVisible();
    expect(
      within(screen.getByRole("row", { name: /Movie Analytics/ })).getByText(
        "Ada Owner",
      ),
    ).toBeVisible();
  });

  it("counts a dashboard as shared only when a share names you, whatever the role", () => {
    const pub = { ...SHARED, shared: false, role: "viewer" as const };
    dashboards = [
      OWNED,
      { ...pub, id: "d3", name: "Public, never shared" },
      { ...pub, id: "d6", name: "Another public" },
      { ...pub, id: "d4", name: "Admin sees it", role: "admin" as const },
      {
        ...pub,
        id: "d5",
        name: "Admin was shared it",
        role: "admin" as const,
        shared: true,
      },
    ];
    render(<DashboardListPage />);
    expect(screen.getByText("5 dashboards · 1 shared with you")).toBeVisible();
  });

  it("filters to the dashboards you own, with a chip that clears it, and combines with the search", () => {
    dashboards = [OWNED, SHARED, { ...OWNED, id: "d3", name: "Mine too" }];
    render(<DashboardListPage />);
    const mine = screen.getByRole("checkbox", { name: "Only mine" });

    fireEvent.click(mine);
    expect(screen.queryByRole("row", { name: /Chart gallery/ })).toBeNull();
    expect(screen.getByRole("row", { name: /Mine too/ })).toBeVisible();
    expect(screen.getByText("Owner is", { exact: false })).toBeVisible();

    fireEvent.change(screen.getByLabelText("Search dashboards"), {
      target: { value: "too" },
    });
    expect(screen.queryByRole("row", { name: /Movie Analytics/ })).toBeNull();

    // Reset clears both; the chip's × clears only its own.
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Owner filter" }),
    );
    expect(screen.getByRole("row", { name: /Mine too/ })).toBeVisible();
    expect(screen.queryByRole("row", { name: /Movie Analytics/ })).toBeNull();
    fireEvent.click(mine);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getAllByRole("row")).toHaveLength(4); // header + 3
  });

  it("says no dashboard matches the filters when Only mine leaves nothing", () => {
    dashboards = [SHARED];
    render(<DashboardListPage />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Only mine" }));
    expect(
      screen.getByText("No dashboards match these filters."),
    ).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("names each row's menu button after its dashboard", () => {
    render(<DashboardListPage />);
    expect(
      screen.getByLabelText("Dashboard options for Chart gallery"),
    ).toBeInTheDocument();
  });

  it("tags a public dashboard and nothing else", () => {
    render(<DashboardListPage />);
    expect(
      within(screen.getByRole("row", { name: /Chart gallery/ })).getByText(
        "Public",
      ),
    ).toBeVisible();
    expect(
      within(screen.getByRole("row", { name: /Movie Analytics/ })).queryByText(
        "Public",
      ),
    ).toBeNull();
  });

  const MENU = [
    "Edit",
    "Rename",
    "Duplicate",
    "Change connection…",
    "Export",
    "Delete…",
  ];
  const menuOf = (name: RegExp) => {
    const row = screen.getByRole("row", { name });
    return MENU.filter((n) => within(row).queryByText(n) !== null);
  };

  it("holds exactly today's actions in the row menu: all six for an owner, Duplicate and Export for a viewer", () => {
    dashboards = [OWNED, SHARED];
    render(<DashboardListPage />);
    expect(menuOf(/Movie Analytics/)).toEqual(MENU);
    expect(menuOf(/Chart gallery/)).toEqual(["Duplicate", "Export"]);
  });

  // The mocked dialogs also render "New dashboard" and "Import" as titles; the
  // mocked Button is the only focusable (tabindex -1) div.
  const buttonLabels = () =>
    Array.from(document.querySelectorAll('div[tabindex="-1"]')).map((b) =>
      b.textContent?.trim(),
    );

  describe("a creator without write permission (#2313)", () => {
    beforeEach(() => {
      sessionUser = { role: "creator", canWrite: false };
    });
    afterEach(() => {
      sessionUser = { role: "creator" };
    });

    it("sees no New dashboard or Import, and no row menu", () => {
      render(<DashboardListPage />);
      expect(buttonLabels()).not.toContain("New dashboard");
      expect(buttonLabels()).not.toContain("Import");
      expect(menuOf(/Movie Analytics/)).toEqual([]);
    });

    it("an admin whose flag is off keeps all six", () => {
      sessionUser = { role: "admin", canWrite: false };
      render(<DashboardListPage />);
      expect(buttonLabels()).toEqual(
        expect.arrayContaining(["New dashboard", "Import"]),
      );
      expect(menuOf(/Movie Analytics/)).toEqual(MENU);
    });
  });

  it("counts dashboards, widgets and connections, and the ones shared with you", () => {
    render(<DashboardListPage />);
    const stat = (label: string) =>
      screen.getByText(label, { selector: "dt" }).nextElementSibling;
    expect(stat("Dashboards")).toHaveTextContent("2");
    expect(stat("Widgets")).toHaveTextContent("8");
    expect(stat("Connections")).toHaveTextContent("2");
    expect(screen.getByText("2 dashboards · 1 shared with you")).toBeVisible();
  });

  it("filters by name and shows a chip that clears the search", () => {
    render(<DashboardListPage />);
    fireEvent.change(screen.getByLabelText("Search dashboards"), {
      target: { value: "gallery" },
    });
    expect(screen.queryByRole("row", { name: /Movie Analytics/ })).toBeNull();
    expect(screen.getByText("Name contains", { exact: false })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Remove Name filter" }));

    expect(screen.getByRole("row", { name: /Movie Analytics/ })).toBeVisible();
    expect(screen.queryByRole("group", { name: "Active filters" })).toBeNull();
  });

  it("still shows the empty state with no dashboards", () => {
    dashboards = [];
    render(<DashboardListPage />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Welcome to NeoBoard")).toBeVisible();
    expect(screen.getByText("Create your first dashboard")).toBeVisible();
  });
});
