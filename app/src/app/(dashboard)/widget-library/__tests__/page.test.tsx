import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import type { ConfirmDialogProps } from "@neoboard/components";
import { MockClosingDialog } from "@/__tests__/helpers/dialog-mocks";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

/**
 * #1899 — the widget library reads connector facts from the descriptor list
 * (`useConnectors`), not from a map of the connectors somebody knew about. The
 * fixture connector below exists nowhere else in the repo.
 */

const connectors = [
  { type: "acme-sheets", label: "Acme Sheets", queryLanguage: "acmeql" },
  { type: "acme-graph", label: "Acme Graph" },
];

const BASE_TEMPLATES = [
  {
    id: "t1",
    name: "Budget rows",
    createdBy: "u1",
    chartType: "table",
    connectorType: "acme-sheets",
    query: "SHEET budget",
    tags: [],
  },
  {
    id: "t2",
    name: "Orphaned",
    chartType: "table",
    connectorType: "uninstalled",
    query: "whatever this was",
    tags: [],
  },
];

type Template = Omit<(typeof BASE_TEMPLATES)[number], "tags"> & {
  tags: string[];
  description?: string;
  connectionId?: string;
};
let templates: Template[] = BASE_TEMPLATES;
let connections: { id: string; name: string }[] = [];
let connectionsFailed = false;

vi.mock("@/hooks/use-connectors", () => ({
  useConnectors: () => ({ data: connectors }),
}));
vi.mock("@/hooks/use-connections", () => ({
  useConnections: () =>
    connectionsFailed
      ? { data: undefined, isError: true }
      : { data: connections, isError: false },
}));
vi.mock("@/hooks/use-widget-templates", () => {
  const idle = () => ({ mutate: vi.fn(), mutateAsync: vi.fn() });
  return {
    useWidgetTemplates: () => ({ data: templates, isLoading: false }),
    useDeleteWidgetTemplate: idle,
    useCreateWidgetTemplate: () => ({
      mutate: mockCreate,
      mutateAsync: vi.fn(),
    }),
  };
});
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1", role: "creator" } } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/plugin/chart-helpers", () => ({
  getChartConfig: (type: string) => ({ label: type }),
}));
vi.mock("@/components/widget-editor-modal", () => ({
  // A lab save, as the real one: onLabSaved once the create resolves, then
  // close. The list has not refetched yet.
  WidgetEditorModal: (
    props: React.ComponentProps<typeof MockClosingDialog> & {
      onLabSaved: () => void;
    },
  ) => (
    <>
      <MockClosingDialog {...props} />
      {props.open && (
        <button
          onClick={() => {
            props.onLabSaved();
            props.onOpenChange(false);
          }}
        >
          Save template
        </button>
      )}
    </>
  ),
}));
vi.mock("@/components/dashboard-picker-dialog", () => ({
  DashboardPickerDialog: MockClosingDialog,
}));

vi.mock("@neoboard/components", () => {
  const Box = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    EmptyState: ({ action }: { action?: React.ReactNode }) => (
      <div>{action}</div>
    ),
    LoadingOverlay: Box,
    Tag: Box,
    // Only the two props the page's own row actions need — forwarding the rest
    // would put `variant` and `size` on a DOM button.
    Button: ({
      children,
      onClick,
      "aria-label": label,
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      "aria-label"?: string;
    }) => (
      <button onClick={onClick} aria-label={label}>
        {children}
      </button>
    ),
    Input: () => null,
    // Hands focus back after the render that closes it, as Radix does.
    ConfirmDialog: function ConfirmDialog({
      open,
      onOpenChange,
      onConfirm,
      returnFocusTo,
    }: ConfirmDialogProps) {
      React.useEffect(() => {
        if (!open) returnFocusTo?.focus();
      }, [open, returnFocusTo]);
      return open ? (
        <>
          <button onClick={() => onOpenChange(false)}>Cancel</button>
          <button onClick={onConfirm}>Delete</button>
        </>
      ) : null;
    },
    // The menu's items render in place: jsdom cannot open a Radix menu.
    DropdownMenu: Box,
    DropdownMenuTrigger: ({ children }: { children?: React.ReactNode }) =>
      children,
    DropdownMenuContent: Box,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuItem: ({
      children,
      onClick,
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
    }) => (
      <button role="menuitem" onClick={onClick}>
        {children}
      </button>
    ),
    Select: Box,
    SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="select-trigger">{children}</div>
    ),
    SelectValue: ({ placeholder }: { placeholder: string }) => (
      <span>{placeholder}</span>
    ),
    SelectContent: Box,
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children?: React.ReactNode;
    }) => <option value={value}>{children}</option>,
    focusedMenuTrigger: () => menuTrigger,
    useToast: () => ({ toast: vi.fn() }),
  };
});

import WidgetLibraryPage from "../page";

// What `focusedMenuTrigger()` finds: the row's "⋯" button.
const menuTrigger = document.body.appendChild(document.createElement("button"));

/** A template's kit row, found by its name. */
const rowOf = (name: string) =>
  screen.getByText(name).closest("tr") as HTMLElement;

beforeEach(() => {
  templates = BASE_TEMPLATES;
  connections = [];
  mockCreate.mockClear();
});

/**
 * #1900: `connectorType` is nullable — a template whose widget needs no
 * connection has none. The column is null; the create API takes absent.
 */
describe("WidgetLibraryPage duplicate", () => {
  it("duplicates a connector-less template without inventing a connector", () => {
    templates = [
      {
        id: "t3",
        name: "Release notes",
        chartType: "markdown",
        connectorType: null as unknown as string,
        query: "# Notes",
        tags: [],
      },
    ];
    render(<WidgetLibraryPage />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const payload = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.name).toBe("Release notes (copy)");
    expect(payload.connectorType).toBeUndefined();
    expect("connectorType" in payload).toBe(true);
  });

  it("keeps the connector when the template has one", () => {
    render(<WidgetLibraryPage />);

    fireEvent.click(screen.getAllByRole("menuitem", { name: "Duplicate" })[0]);

    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      connectorType: "acme-sheets",
    });
  });
});

describe("WidgetLibraryPage — connector facts come from the descriptor list (#1899)", () => {
  it("offers one connector filter option per installed connector, by label", () => {
    render(<WidgetLibraryPage />);
    const filter = screen.getByText("Connector").closest("div")!
      .parentElement as HTMLElement;
    const options = within(filter)
      .getAllByRole("option")
      .map((o) => [o.getAttribute("value"), o.textContent]);
    expect(options).toEqual([
      ["all", "All connectors"],
      ["acme-sheets", "Acme Sheets"],
      ["acme-graph", "Acme Graph"],
    ]);
  });

  // #1905: the connector was printed as the raw `connectorType`.
  it("names an unbound template's connection by its connector's label, the type when it is gone", () => {
    render(<WidgetLibraryPage />);
    expect(
      within(rowOf("Budget rows")).getByText("Any Acme Sheets connection"),
    ).toBeInTheDocument();
    expect(
      within(rowOf("Orphaned")).getByText("Any uninstalled connection"),
    ).toBeInTheDocument();
  });
});

describe("WidgetLibraryPage — kit rows (#2254)", () => {
  it("shows a bound template's connection by name, the chart by label and the tags", () => {
    connections = [{ id: "c1", name: "Movies graph" }];
    templates = [
      {
        ...BASE_TEMPLATES[0],
        connectionId: "c1",
        description: "Ranked bar",
        tags: ["movies", "kpi"],
      },
    ];
    render(<WidgetLibraryPage />);

    const cells = within(rowOf("Budget rows"))
      .getAllByRole("cell")
      .slice(0, 4)
      .map((c) => c.textContent);
    expect(cells).toEqual([
      "Budget rowsRanked bar",
      "table",
      "Movies graph",
      "movieskpi",
    ]);
  });

  it("reads 'Connection not available', not '…', when the connections request fails", () => {
    connectionsFailed = true;
    templates = [{ ...BASE_TEMPLATES[0], connectionId: "c1" }];
    try {
      render(<WidgetLibraryPage />);
      expect(
        within(rowOf("Budget rows")).getByText("Connection not available"),
      ).toBeInTheDocument();
    } finally {
      connectionsFailed = false;
    }
  });

  it("subtitles the page with the template count", () => {
    render(<WidgetLibraryPage />);
    expect(
      screen.getByText(
        "Reusable widgets you can drop into any dashboard · 2 templates",
      ),
    ).toBeInTheDocument();
  });

  it("offers every current action on a template the user owns, and only Use and Duplicate on another's", () => {
    render(<WidgetLibraryPage />);
    const items = (name: string) =>
      within(rowOf(name))
        .getAllByRole("menuitem")
        .map((i) => i.textContent);
    expect(items("Budget rows")).toEqual([
      "Use in Dashboard",
      "Duplicate",
      "Edit",
      "Delete",
    ]);
    expect(items("Orphaned")).toEqual(["Use in Dashboard", "Duplicate"]);
  });
});

describe("WidgetLibraryPage — where focus goes after Delete template (#2125)", () => {
  it.each([
    ["Cancel", () => menuTrigger],
    ["Delete", () => screen.getByRole("heading", { name: "Widget Library" })],
  ])(
    "%s hands focus back: the button, or the heading once the row is gone",
    (button, target) => {
      menuTrigger.blur();
      render(<WidgetLibraryPage />);

      fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
      fireEvent.click(screen.getByRole("button", { name: button }));

      expect(target()).toHaveFocus();
    },
  );
});

// #2146: the editor and Use in Dashboard have no Trigger either.
it.each([
  ["New template", "button"],
  ["Edit", "menuitem"],
  ["Use in Dashboard", "menuitem"],
] as const)(
  "Cancel on what %s opened puts focus back on its opener (#2146)",
  (name, role) => {
    menuTrigger.blur();
    render(<WidgetLibraryPage />);
    const opener = screen.getAllByRole(role, { name })[0];

    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // A menu item has no focus of its own: the row's "⋯" button gets it back.
    expect(role === "button" ? opener : menuTrigger).toHaveFocus();
  },
);

// #2146: the empty state and its button leave once the list refetches, which
// is after the editor has closed: focus lands on the heading, not the button.
it("a template saved from the empty state puts focus on the heading (#2146)", () => {
  templates = [];
  render(<WidgetLibraryPage />);

  fireEvent.click(
    screen.getByRole("button", { name: "Create your first template" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save template" }));

  expect(screen.getByRole("heading", { name: "Widget Library" })).toHaveFocus();
});
