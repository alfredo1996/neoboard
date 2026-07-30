import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useParameterStore } from "@/stores/parameter-store";

/* ---------- probes ---------- */

/**
 * Counts DashboardContainer unmounts. Incremented in the effect CLEANUP, so a
 * remount is unambiguous: a re-render never runs cleanup, a remount always
 * does. This is the #1370 invariant — toggling edit mode must not tear the
 * widget tree down.
 */
let unmountCount = 0;
let nextInstanceId = 0;

interface ProbeActions {
  onRemoveWidget?: (id: string) => void;
  onEditWidget?: (w: unknown) => void;
  onDuplicateWidget?: (id: string) => void;
  onLayoutChange?: (g: unknown[]) => void;
  onWidgetSettingsChange?: (id: string, s: Record<string, unknown>) => void;
  onNavigateToPage?: (pageId: string, widgetId?: string) => void;
  onSyncWidget?: (w: unknown) => void;
  onDetachWidget?: (id: string) => void;
}

vi.mock("@/components/dashboard-container", () => ({
  DashboardContainer: ({
    editable,
    refetchInterval,
    actions,
    page,
  }: {
    editable?: boolean;
    refetchInterval?: number | false;
    actions?: ProbeActions;
    page: { widgets: { id: string }[] };
  }) => {
    const [instance] = React.useState(() => ++nextInstanceId);
    React.useEffect(() => {
      return () => {
        unmountCount += 1;
      };
    }, []);
    const w = page.widgets[0];
    return (
      <div
        data-testid="dashboard-container"
        data-instance={String(instance)}
        data-editable={String(!!editable)}
        data-refetch-interval={String(refetchInterval)}
      >
        {/* Action probes — the workspace owns these handlers, so they are only
            reachable through the container's `actions` prop. */}
        <button
          data-testid="act-edit"
          onClick={() => actions?.onEditWidget?.(w)}
        />
        <button
          data-testid="act-remove"
          onClick={() => actions?.onRemoveWidget?.(w.id)}
        />
        <button
          data-testid="act-duplicate"
          onClick={() => actions?.onDuplicateWidget?.(w.id)}
        />
        <button
          data-testid="act-navigate"
          onClick={() => actions?.onNavigateToPage?.("p3", "w3")}
        />
        <button
          data-testid="act-navigate-unknown"
          onClick={() => actions?.onNavigateToPage?.("nope")}
        />
        <button
          data-testid="act-sync"
          onClick={() => actions?.onSyncWidget?.(w)}
        />
        <button
          data-testid="act-detach"
          onClick={() => actions?.onDetachWidget?.(w.id)}
        />
        <button
          data-testid="act-settings"
          onClick={() =>
            actions?.onWidgetSettingsChange?.(w.id, { title: "Tweaked" })
          }
        />
        <button
          data-testid="act-layout"
          onClick={() =>
            actions?.onLayoutChange?.([{ i: w.id, x: 2, y: 2, w: 4, h: 3 }])
          }
        />
      </div>
    );
  },
}));

vi.mock("@/lib/widget/scroll-to-widget", () => ({
  scrollToWidgetWhenReady: vi.fn(),
}));

/* ---------- mocks ---------- */

const mockPush = vi.fn();
const mockReplace = vi.fn();
let searchParams = new URLSearchParams();
let pathname = "/d1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => searchParams,
  usePathname: () => pathname,
  useParams: () => ({ id: "d1" }),
}));

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockUseDashboard = vi.fn();
const mockMutateAsync = vi.fn().mockResolvedValue({});
const mockUpdateMutate = vi.fn();
vi.mock("@/hooks/use-dashboards", () => ({
  useDashboard: () => mockUseDashboard(),
  useUpdateDashboard: () => ({
    mutate: mockUpdateMutate,
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

const mockUseConnections = vi.fn();
vi.mock("@/hooks/use-connections", () => ({
  useConnections: (...args: unknown[]) => mockUseConnections(...args),
}));

const mockUseWidgetTemplates = vi.fn();
vi.mock("@/hooks/use-widget-templates", () => ({
  useWidgetTemplates: (...args: unknown[]) => mockUseWidgetTemplates(...args),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueriesData: () => [],
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@/components/widget-editor-modal", () => ({
  WidgetEditorModal: ({ open }: { open?: boolean }) =>
    open ? <div data-testid="widget-editor-modal" /> : null,
}));

vi.mock("@/components/dashboard-assign-panel", () => ({
  DashboardAssignPanel: ({
    onTogglePublic,
  }: {
    onTogglePublic?: (v: boolean) => void;
  }) => (
    <div data-testid="assign-panel">
      <button
        data-testid="toggle-public"
        onClick={() => onTogglePublic?.(true)}
      />
    </div>
  ),
}));

vi.mock("@/components/save-template-dialog", () => ({
  SaveTemplateDialog: () => <div data-testid="save-template-dialog" />,
}));

vi.mock("@/components/page-tabs", () => ({
  PageTabs: ({
    pages,
    activeIndex,
    editable,
    onSelect,
    onAdd,
    onRemove,
    onRename,
    onReorder,
  }: {
    pages: { id: string; title: string }[];
    activeIndex: number;
    editable?: boolean;
    onSelect: (index: number) => void;
    onAdd?: () => void;
    onRemove?: (i: number) => void;
    onRename?: (i: number, title: string) => void;
    onReorder?: (from: number, to: number) => void;
  }) => (
    <div data-testid="page-tabs" data-editable={String(!!editable)}>
      {pages.map((p, i) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={i === activeIndex}
          data-testid="page-tab"
          onClick={() => onSelect(i)}
        >
          {p.title}
        </button>
      ))}
      <button data-testid="tab-add" onClick={() => onAdd?.()} />
      <button data-testid="tab-remove" onClick={() => onRemove?.(1)} />
      <button
        data-testid="tab-rename"
        onClick={() => onRename?.(0, "Renamed")}
      />
      <button data-testid="tab-reorder" onClick={() => onReorder?.(0, 2)} />
    </div>
  ),
}));

vi.mock("@neoboard/components", () => {
  const passthrough = [
    "Toolbar",
    "ToolbarSection",
    "ToolbarSeparator",
    "Badge",
    "Skeleton",
    "Alert",
    "AlertDescription",
    "Sheet",
    "SheetContent",
    "SheetHeader",
    "SheetTitle",
    "SheetTrigger",
    "DropdownMenu",
    "DropdownMenuContent",
    "DropdownMenuLabel",
    "DropdownMenuRadioItem",
    "DropdownMenuSeparator",
    "DropdownMenuTrigger",
  ];
  const buttons = ["Button", "LoadingButton"];

  const pass = (name: string) => {
    const C = ({ children }: { children?: React.ReactNode }) => (
      <div data-slot={name}>{children}</div>
    );
    C.displayName = name;
    return C;
  };
  const btn = (name: string) => {
    const C = ({
      children,
      onClick,
      disabled,
      title,
      ...rest
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
      title?: string;
      [key: string]: unknown;
    }) => (
      <button
        data-slot={name}
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-label={rest["aria-label"] as string | undefined}
        data-testid={rest["data-testid"] as string | undefined}
      >
        {children}
      </button>
    );
    C.displayName = name;
    return C;
  };

  return {
    ...Object.fromEntries(passthrough.map((n) => [n, pass(n)])),
    ...Object.fromEntries(buttons.map((n) => [n, btn(n)])),
    Input: ({
      value,
      onChange,
      ...rest
    }: {
      value?: string;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      [key: string]: unknown;
    }) => (
      <input
        value={value}
        onChange={onChange}
        data-testid={rest["data-testid"] as string | undefined}
      />
    ),
    EmptyState: ({
      title,
      description,
      action,
    }: {
      title?: string;
      description?: string;
      action?: React.ReactNode;
    }) => (
      <div data-slot="EmptyState">
        <h2>{title}</h2>
        <p>{description}</p>
        {action}
      </div>
    ),
    TimeAgo: () => <span>just now</span>,
    // Radix wires onValueChange through context; expose it as two buttons so
    // the interval handler's "off" and numeric branches are reachable.
    DropdownMenuRadioGroup: ({
      children,
      onValueChange,
    }: {
      children?: React.ReactNode;
      onValueChange?: (v: string) => void;
    }) => (
      <div data-slot="DropdownMenuRadioGroup">
        <button data-testid="pick-off" onClick={() => onValueChange?.("off")} />
        <button data-testid="pick-60" onClick={() => onValueChange?.("60")} />
        {children}
      </div>
    ),
    ConfirmDialog: ({ open, title }: { open?: boolean; title?: string }) =>
      open ? <div role="dialog">{title}</div> : null,
    useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
    cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "),
  };
});

/* ---------- import under test ---------- */

import { DashboardWorkspace } from "../dashboard-workspace";

/* ---------- fixtures ---------- */

function makeDashboard(pageCount = 3, role = "owner") {
  return {
    id: "d1",
    name: "Sales",
    role,
    version: 1,
    updatedAt: new Date("2026-01-01").toISOString(),
    updatedByName: "Alice",
    isPublic: false,
    layoutJson: {
      version: 2 as const,
      pages: Array.from({ length: pageCount }, (_, i) => ({
        id: `p${i + 1}`,
        title: `Page ${i + 1}`,
        widgets: [
          {
            id: `w${i + 1}`,
            chartType: "bar",
            connectionId: "c1",
            query: "SELECT 1",
            settings: {},
          },
        ],
        gridLayout: [{ i: `w${i + 1}`, x: 0, y: 0, w: 4, h: 3 }],
      })),
    },
  };
}

/** A dashboard whose only widget sets a parameter — enables the Filters button. */
function makeParameterDashboard() {
  const d = makeDashboard(1);
  d.layoutJson.pages[0].widgets[0] = {
    ...d.layoutJson.pages[0].widgets[0],
    chartType: "parameter-select",
  };
  return d;
}

/** A stable dashboard object, as a real query cache would hand back. */
let dashboard = makeDashboard();

beforeEach(() => {
  unmountCount = 0;
  nextInstanceId = 0;
  searchParams = new URLSearchParams();
  pathname = "/d1";
  dashboard = makeDashboard();
  // Both stores are module singletons, and the workspace persists parameters
  // to localStorage on unmount then restores them on the next mount — clear
  // all four or values bleed into the next case.
  sessionStorage.clear();
  localStorage.clear();
  useDashboardStore.getState().reset();
  useParameterStore.getState().clearAll();
  vi.clearAllMocks();
  mockUseDashboard.mockImplementation(() => ({
    data: dashboard,
    isLoading: false,
    isFetching: false,
  }));
  mockUseSession.mockReturnValue({
    data: { user: { role: "admin", canWrite: true } },
  });
  mockUseConnections.mockReturnValue({ data: [] });
  mockUseWidgetTemplates.mockReturnValue({ data: [] });
});

/* ---------- tests ---------- */

describe("DashboardWorkspace", () => {
  // ── #1370: no remount across the mode toggle ────────────────────────
  it("does not unmount the widget tree when edit mode is toggled on", () => {
    const { rerender } = render(
      <DashboardWorkspace id="d1" editMode={false} />,
    );

    const before = screen
      .getByTestId("dashboard-container")
      .getAttribute("data-instance");
    expect(before).toBeTruthy();
    expect(unmountCount).toBe(0);

    pathname = "/d1/edit";
    rerender(<DashboardWorkspace id="d1" editMode={true} />);

    // Same probe instance ⇒ same React element, never torn down.
    expect(
      screen.getByTestId("dashboard-container").getAttribute("data-instance"),
    ).toBe(before);
    expect(unmountCount).toBe(0);
    // The mode still reached the tree as a plain prop.
    expect(
      screen.getByTestId("dashboard-container").getAttribute("data-editable"),
    ).toBe("true");
  });

  it("does not unmount the widget tree when edit mode is toggled off", () => {
    pathname = "/d1/edit";
    const { rerender } = render(<DashboardWorkspace id="d1" editMode={true} />);

    const before = screen
      .getByTestId("dashboard-container")
      .getAttribute("data-instance");
    expect(unmountCount).toBe(0);

    pathname = "/d1";
    rerender(<DashboardWorkspace id="d1" editMode={false} />);

    expect(
      screen.getByTestId("dashboard-container").getAttribute("data-instance"),
    ).toBe(before);
    expect(unmountCount).toBe(0);
    expect(
      screen.getByTestId("dashboard-container").getAttribute("data-editable"),
    ).toBe("false");
  });

  // ── #1371: the active page survives the toggle ──────────────────────
  it("keeps the active page when entering and leaving edit mode", () => {
    const { rerender } = render(
      <DashboardWorkspace id="d1" editMode={false} />,
    );

    useDashboardStore.getState().setActivePage(2);
    rerender(<DashboardWorkspace id="d1" editMode={false} />);
    expect(screen.getAllByRole("tab")[2]).toHaveAttribute(
      "aria-selected",
      "true",
    );

    rerender(<DashboardWorkspace id="d1" editMode={true} />);
    expect(useDashboardStore.getState().activePageIndex).toBe(2);
    expect(screen.getAllByRole("tab")[2]).toHaveAttribute(
      "aria-selected",
      "true",
    );

    rerender(<DashboardWorkspace id="d1" editMode={false} />);
    expect(useDashboardStore.getState().activePageIndex).toBe(2);
    expect(screen.getAllByRole("tab")[2]).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("initialises the active page from ?page= on first load", () => {
    searchParams = new URLSearchParams("page=1");
    render(<DashboardWorkspace id="d1" editMode={true} />);
    expect(useDashboardStore.getState().activePageIndex).toBe(1);
  });

  it("clamps a negative ?page= to the first page", () => {
    searchParams = new URLSearchParams("page=-1");
    render(<DashboardWorkspace id="d1" editMode={true} />);
    expect(useDashboardStore.getState().activePageIndex).toBe(0);
  });

  it("clamps a non-numeric ?page= to the first page", () => {
    searchParams = new URLSearchParams("page=abc");
    render(<DashboardWorkspace id="d1" editMode={true} />);
    expect(useDashboardStore.getState().activePageIndex).toBe(0);
  });

  // ── #1371 residual: a refetch must not reset the page ───────────────
  it("keeps the active page when the dashboard query refetches", () => {
    pathname = "/d1/edit";
    const { rerender } = render(<DashboardWorkspace id="d1" editMode={true} />);

    useDashboardStore.getState().setActivePage(2);
    // A refetch hands back a fresh object at the same version — as
    // useUpdateDashboard's invalidation does right after a save.
    dashboard = makeDashboard();
    rerender(<DashboardWorkspace id="d1" editMode={true} />);

    expect(useDashboardStore.getState().activePageIndex).toBe(2);
  });

  it("reloads the layout when the server version changes", () => {
    pathname = "/d1/edit";
    const { rerender } = render(<DashboardWorkspace id="d1" editMode={true} />);

    const bumped = makeDashboard();
    bumped.version = 2;
    bumped.layoutJson.pages[0].title = "Renamed";
    dashboard = bumped;
    rerender(<DashboardWorkspace id="d1" editMode={true} />);

    expect(useDashboardStore.getState().layout.pages[0].title).toBe("Renamed");
  });

  it("does not discard unsaved edits when the dashboard refetches", () => {
    pathname = "/d1/edit";
    const { rerender } = render(<DashboardWorkspace id="d1" editMode={true} />);

    useDashboardStore.getState().renamePage(0, "My unsaved title");
    expect(useDashboardStore.getState().hasUnsavedChanges()).toBe(true);

    const bumped = makeDashboard();
    bumped.version = 2;
    dashboard = bumped;
    rerender(<DashboardWorkspace id="d1" editMode={true} />);

    expect(useDashboardStore.getState().layout.pages[0].title).toBe(
      "My unsaved title",
    );
  });

  // ── mode-specific chrome ────────────────────────────────────────────
  it("renders edit chrome in edit mode", () => {
    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);

    expect(screen.getByText("Add Widget")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText(/Editing:/)).toBeInTheDocument();
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.getByTestId("page-tabs")).toHaveAttribute(
      "data-editable",
      "true",
    );
  });

  it("renders view chrome in view mode", () => {
    render(<DashboardWorkspace id="d1" editMode={false} />);

    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.queryByText("Add Widget")).toBeNull();
    expect(screen.queryByText("Save")).toBeNull();
    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(screen.getByTestId("page-tabs")).toHaveAttribute(
      "data-editable",
      "false",
    );
  });

  it("hides the Edit button when the user cannot edit", () => {
    dashboard = makeDashboard(3, "viewer");
    render(<DashboardWorkspace id="d1" editMode={false} />);
    expect(screen.queryByText("Edit")).toBeNull();
  });

  // ── auto-refresh is a view-mode concern ─────────────────────────────
  it("disables widget auto-refresh in edit mode", () => {
    const withRefresh = makeDashboard();
    (withRefresh.layoutJson as unknown as { settings: unknown }).settings = {
      autoRefresh: true,
      refreshIntervalSeconds: 30,
    };
    dashboard = withRefresh;

    const { rerender } = render(
      <DashboardWorkspace id="d1" editMode={false} />,
    );
    expect(
      screen
        .getByTestId("dashboard-container")
        .getAttribute("data-refetch-interval"),
    ).toBe("30000");

    pathname = "/d1/edit";
    rerender(<DashboardWorkspace id="d1" editMode={true} />);
    expect(
      screen
        .getByTestId("dashboard-container")
        .getAttribute("data-refetch-interval"),
    ).toBe("false");
  });

  // ── view mode must not fetch the editor's data ──────────────────────
  it("does not fetch connections or widget templates in view mode", () => {
    render(<DashboardWorkspace id="d1" editMode={false} />);
    expect(mockUseConnections).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
    expect(mockUseWidgetTemplates).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: false }),
    );
  });

  it("fetches connections and widget templates in edit mode", () => {
    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);
    expect(mockUseConnections).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
    expect(mockUseWidgetTemplates).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: true }),
    );
  });

  // ── loading / not-found ─────────────────────────────────────────────
  it("renders a skeleton while loading", () => {
    mockUseDashboard.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
    });
    render(<DashboardWorkspace id="d1" editMode={false} />);
    expect(screen.queryByTestId("dashboard-container")).toBeNull();
  });

  it("renders a not-found state when the dashboard is missing", () => {
    mockUseDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
    });
    render(<DashboardWorkspace id="d1" editMode={false} />);
    expect(screen.getByText("Dashboard not found")).toBeInTheDocument();
  });

  // ── Saving ──────────────────────────────────────────────────────────
  it("saves the store layout and passes the expected version", async () => {
    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);

    await userEvent.click(screen.getByText("Save"));

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: "d1", expectedVersion: 1 }),
    );
    expect(useDashboardStore.getState().hasUnsavedChanges()).toBe(false);
  });

  it("replaces a y: Infinity grid position before saving", async () => {
    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);

    useDashboardStore.getState().addWidget(
      {
        id: "wNew",
        chartType: "bar",
        connectionId: "c1",
        query: "SELECT 1",
        settings: {},
      } as never,
      { i: "wNew", x: 0, y: Infinity, w: 4, h: 3 },
    );

    await userEvent.click(screen.getByText("Save"));

    const sent = mockMutateAsync.mock.calls[0][0] as {
      layoutJson: { pages: { gridLayout: { i: string; y: number }[] }[] };
    };
    const placed = sent.layoutJson.pages[0].gridLayout.find(
      (g) => g.i === "wNew",
    );
    expect(Number.isFinite(placed?.y)).toBe(true);
  });

  it("surfaces a save failure inline", async () => {
    pathname = "/d1/edit";
    mockMutateAsync.mockRejectedValueOnce(new Error("Version conflict"));
    render(<DashboardWorkspace id="d1" editMode={true} />);

    await userEvent.click(screen.getByText("Save"));

    expect(await screen.findByText("Version conflict")).toBeInTheDocument();
  });

  // ── Widget editor ───────────────────────────────────────────────────
  it("opens the widget editor from Add Widget", async () => {
    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);

    expect(screen.queryByTestId("widget-editor-modal")).toBeNull();
    await userEvent.click(screen.getByText("Add Widget"));
    expect(screen.getByTestId("widget-editor-modal")).toBeInTheDocument();
  });

  it("opens the widget editor straight away for ?templateId=", () => {
    pathname = "/d1/edit";
    searchParams = new URLSearchParams("templateId=t1");
    render(<DashboardWorkspace id="d1" editMode={true} />);
    expect(screen.getByTestId("widget-editor-modal")).toBeInTheDocument();
  });

  // ── Auto-refresh (view mode only) ────────────────────────────────────
  it("persists a custom auto-refresh interval", async () => {
    render(<DashboardWorkspace id="d1" editMode={false} />);

    await userEvent.type(screen.getByTestId("custom-interval-input"), "45");
    await userEvent.click(screen.getByTestId("custom-interval-apply"));

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "d1",
        layoutJson: expect.objectContaining({
          settings: { autoRefresh: true, refreshIntervalSeconds: 45 },
        }),
      }),
    );
  });

  it("ignores a custom interval below the 5s floor", async () => {
    render(<DashboardWorkspace id="d1" editMode={false} />);

    await userEvent.type(screen.getByTestId("custom-interval-input"), "2");
    await userEvent.click(screen.getByTestId("custom-interval-apply"));

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("persists a preset interval and turning auto-refresh off", async () => {
    render(<DashboardWorkspace id="d1" editMode={false} />);

    await userEvent.click(screen.getByTestId("pick-60"));
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        layoutJson: expect.objectContaining({
          settings: { autoRefresh: true, refreshIntervalSeconds: 60 },
        }),
      }),
    );

    mockMutateAsync.mockClear();
    await userEvent.click(screen.getByTestId("pick-off"));
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        layoutJson: expect.objectContaining({
          settings: { autoRefresh: false },
        }),
      }),
    );
  });

  // ── Pages ───────────────────────────────────────────────────────────
  it("selecting a page tab changes the active page", async () => {
    render(<DashboardWorkspace id="d1" editMode={false} />);

    await userEvent.click(screen.getAllByTestId("page-tab")[1]);
    expect(useDashboardStore.getState().activePageIndex).toBe(1);
  });

  it("shows the view-mode empty state with an editor CTA", () => {
    const empty = makeDashboard(1);
    empty.layoutJson.pages[0].widgets = [];
    empty.layoutJson.pages[0].gridLayout = [];
    dashboard = empty;

    render(<DashboardWorkspace id="d1" editMode={false} />);
    expect(screen.getByText("This page has no widgets.")).toBeInTheDocument();
    expect(screen.getByText("Add widgets in the editor")).toBeInTheDocument();
  });

  it("shows the edit-mode empty state with an Add Widget CTA", () => {
    pathname = "/d1/edit";
    const empty = makeDashboard(1);
    empty.layoutJson.pages[0].widgets = [];
    empty.layoutJson.pages[0].gridLayout = [];
    dashboard = empty;

    render(<DashboardWorkspace id="d1" editMode={true} />);
    expect(
      screen.getByText('Click "Add Widget" to get started.'),
    ).toBeInTheDocument();
  });

  it("hides the page tabs for a single-page dashboard in view mode", () => {
    dashboard = makeDashboard(1);
    render(<DashboardWorkspace id="d1" editMode={false} />);
    expect(screen.queryByTestId("page-tabs")).toBeNull();
  });

  // ── Version bump banner (view mode only) ────────────────────────────
  it("announces another user's save in view mode", () => {
    sessionStorage.setItem("__nb_dash_ver_d1", "1");
    const bumped = makeDashboard();
    bumped.version = 2;
    dashboard = bumped;

    render(<DashboardWorkspace id="d1" editMode={false} />);
    expect(screen.getByText("Dashboard updated by Alice")).toBeInTheDocument();
  });

  it("does not announce a version bump in edit mode", () => {
    sessionStorage.setItem("__nb_dash_ver_d1", "1");
    const bumped = makeDashboard();
    bumped.version = 2;
    dashboard = bumped;

    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);
    expect(screen.queryByText(/Dashboard updated by/)).toBeNull();
  });

  // ── Readers never reach the editor ──────────────────────────────────
  it("redirects a reader out of edit mode", () => {
    mockUseSession.mockReturnValue({
      data: { user: { role: "reader", canWrite: false } },
    });
    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);
    expect(mockReplace).toHaveBeenCalledWith("/d1", { scroll: false });
  });

  it("leaves a reader alone in view mode", () => {
    mockUseSession.mockReturnValue({
      data: { user: { role: "reader", canWrite: false } },
    });
    render(<DashboardWorkspace id="d1" editMode={false} />);
    expect(mockReplace).not.toHaveBeenCalledWith("/d1", { scroll: false });
  });

  // ── Keyboard shortcuts — the #1370 trigger ──────────────────────────
  it("Cmd+E from view mode navigates to edit, carrying the page", () => {
    const { rerender } = render(
      <DashboardWorkspace id="d1" editMode={false} />,
    );
    useDashboardStore.getState().setActivePage(2);
    rerender(<DashboardWorkspace id="d1" editMode={false} />);

    fireEvent.keyDown(document, { key: "e", metaKey: true });

    expect(mockPush).toHaveBeenCalledWith("/d1/edit?page=2", { scroll: false });
  });

  it("Cmd+E from edit mode navigates back to view without a page param", () => {
    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);

    fireEvent.keyDown(document, { key: "e", metaKey: true });

    expect(mockPush).toHaveBeenCalledWith("/d1", { scroll: false });
  });

  it("Cmd+E is inert for a user who cannot edit", () => {
    dashboard = makeDashboard(3, "viewer");
    render(<DashboardWorkspace id="d1" editMode={false} />);

    fireEvent.keyDown(document, { key: "e", metaKey: true });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("Cmd+E out of edit mode is blocked by unsaved changes", () => {
    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);
    useDashboardStore.getState().renamePage(0, "Dirty");

    fireEvent.keyDown(document, { key: "e", metaKey: true });

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("Unsaved changes");
  });

  it("Cmd+S saves in edit mode only", () => {
    render(<DashboardWorkspace id="d1" editMode={false} />);
    fireEvent.keyDown(document, { key: "s", metaKey: true });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("Cmd+Shift+N opens the widget editor in edit mode", () => {
    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);

    fireEvent.keyDown(document, { key: "n", metaKey: true, shiftKey: true });

    expect(screen.getByTestId("widget-editor-modal")).toBeInTheDocument();
  });

  it("Escape closes the widget editor", async () => {
    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);
    await userEvent.click(screen.getByText("Add Widget"));
    expect(screen.getByTestId("widget-editor-modal")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("widget-editor-modal")).toBeNull();
  });

  // ── Widget actions are wired only in edit mode ───────────────────────
  it("does not wire widget mutations in view mode", () => {
    render(<DashboardWorkspace id="d1" editMode={false} />);
    const before = useDashboardStore.getState().layout;
    fireEvent.click(screen.getByTestId("act-remove"));
    expect(useDashboardStore.getState().layout).toBe(before);
  });

  it("removes, duplicates and re-settings a widget in edit mode", () => {
    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);

    fireEvent.click(screen.getByTestId("act-duplicate"));
    expect(useDashboardStore.getState().layout.pages[0].widgets).toHaveLength(
      2,
    );

    fireEvent.click(screen.getByTestId("act-settings"));
    expect(
      useDashboardStore.getState().layout.pages[0].widgets[0].settings,
    ).toMatchObject({ title: "Tweaked" });

    fireEvent.click(screen.getByTestId("act-layout"));
    expect(
      useDashboardStore.getState().layout.pages[0].gridLayout[0],
    ).toMatchObject({ x: 2, y: 2 });

    fireEvent.click(screen.getByTestId("act-remove"));
    expect(useDashboardStore.getState().layout.pages[0].widgets).toHaveLength(
      1,
    );
  });

  it("opens the editor for an existing widget", () => {
    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);
    fireEvent.click(screen.getByTestId("act-edit"));
    expect(screen.getByTestId("widget-editor-modal")).toBeInTheDocument();
  });

  it("navigates to another page from a click action", () => {
    render(<DashboardWorkspace id="d1" editMode={false} />);
    fireEvent.click(screen.getByTestId("act-navigate"));
    expect(useDashboardStore.getState().activePageIndex).toBe(2);
  });

  it("ignores a click action pointing at a page that no longer exists", () => {
    render(<DashboardWorkspace id="d1" editMode={false} />);
    fireEvent.click(screen.getByTestId("act-navigate-unknown"));
    expect(useDashboardStore.getState().activePageIndex).toBe(0);
  });

  // ── Template sync / detach ──────────────────────────────────────────
  it("syncs a widget from its template", () => {
    pathname = "/d1/edit";
    const linked = makeDashboard(1);
    linked.layoutJson.pages[0].widgets[0] = {
      ...linked.layoutJson.pages[0].widgets[0],
      templateId: "t1",
    } as never;
    dashboard = linked;
    mockUseWidgetTemplates.mockReturnValue({
      data: [
        {
          id: "t1",
          chartType: "line",
          query: "SELECT 2",
          settings: { title: "From template" },
          updatedAt: new Date("2026-02-02"),
        },
      ],
    });

    render(<DashboardWorkspace id="d1" editMode={true} />);
    fireEvent.click(screen.getByTestId("act-sync"));

    const w = useDashboardStore.getState().layout.pages[0].widgets[0];
    expect(w.chartType).toBe("line");
    expect(w.query).toBe("SELECT 2");
  });

  it("leaves the widget alone when its template was deleted", () => {
    pathname = "/d1/edit";
    const linked = makeDashboard(1);
    linked.layoutJson.pages[0].widgets[0] = {
      ...linked.layoutJson.pages[0].widgets[0],
      templateId: "gone",
    } as never;
    dashboard = linked;

    render(<DashboardWorkspace id="d1" editMode={true} />);
    fireEvent.click(screen.getByTestId("act-sync"));

    expect(
      useDashboardStore.getState().layout.pages[0].widgets[0].chartType,
    ).toBe("bar");
  });

  it("detaches a widget from its template", () => {
    pathname = "/d1/edit";
    const linked = makeDashboard(1);
    linked.layoutJson.pages[0].widgets[0] = {
      ...linked.layoutJson.pages[0].widgets[0],
      templateId: "t1",
    } as never;
    dashboard = linked;

    render(<DashboardWorkspace id="d1" editMode={true} />);
    fireEvent.click(screen.getByTestId("act-detach"));

    expect(
      useDashboardStore.getState().layout.pages[0].widgets[0].templateId,
    ).toBeUndefined();
  });

  // ── Page management (edit mode) ─────────────────────────────────────
  it("adds, renames, removes and reorders pages", () => {
    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);

    fireEvent.click(screen.getByTestId("tab-add"));
    expect(useDashboardStore.getState().layout.pages).toHaveLength(4);

    fireEvent.click(screen.getByTestId("tab-rename"));
    expect(useDashboardStore.getState().layout.pages[0].title).toBe("Renamed");

    fireEvent.click(screen.getByTestId("tab-reorder"));
    expect(useDashboardStore.getState().layout.pages[2].title).toBe("Renamed");

    fireEvent.click(screen.getByTestId("tab-remove"));
    expect(useDashboardStore.getState().layout.pages).toHaveLength(3);
  });

  // ── Parameters ↔ URL ────────────────────────────────────────────────
  it("applies param_ values from the URL on mount", () => {
    searchParams = new URLSearchParams("param_year=1999");
    render(<DashboardWorkspace id="d1" editMode={false} />);
    expect(useParameterStore.getState().parameters.year?.value).toBe("1999");
  });

  it("mirrors parameter changes back into the URL", () => {
    render(<DashboardWorkspace id="d1" editMode={false} />);

    useParameterStore
      .getState()
      .setParameter(
        "dept",
        "Sales",
        "Sales",
        "dept",
        "text",
        "selector-widget",
        "w1",
      );

    expect(mockReplace).toHaveBeenCalledWith("/d1?param_dept=Sales", {
      scroll: false,
    });
  });

  it("drops the query string once every parameter is cleared", () => {
    render(<DashboardWorkspace id="d1" editMode={false} />);

    useParameterStore
      .getState()
      .setParameter("dept", "", "", "dept", "text", "selector-widget", "w1");

    expect(mockReplace).toHaveBeenCalledWith("/d1", { scroll: false });
  });

  // ── Toolbar odds and ends ───────────────────────────────────────────
  it("toggles the parameter bar", async () => {
    // The Filters button is disabled until the dashboard has a parameter
    // widget, and the bar auto-shows once one exists — so it starts as "Hide".
    dashboard = makeParameterDashboard();
    render(<DashboardWorkspace id="d1" editMode={false} />);

    await userEvent.click(screen.getByLabelText("Hide parameters"));
    expect(screen.getByLabelText("Show parameters")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Show parameters"));
    expect(screen.getByLabelText("Hide parameters")).toBeInTheDocument();
  });

  it("keeps the parameter toggle disabled with no parameter widgets", () => {
    render(<DashboardWorkspace id="d1" editMode={false} />);
    expect(screen.getByLabelText("Show parameters")).toBeDisabled();
  });

  it("badges the active parameter count in both toolbars", () => {
    dashboard = makeParameterDashboard();
    const { rerender } = render(
      <DashboardWorkspace id="d1" editMode={false} />,
    );

    // Must be set after mount: restoreFromDashboard() clears the store first.
    useParameterStore
      .getState()
      .setParameter(
        "dept",
        "Sales",
        "Sales",
        "dept",
        "text",
        "selector-widget",
        "w1",
      );
    rerender(<DashboardWorkspace id="d1" editMode={false} />);
    expect(screen.getByLabelText("Hide parameters")).toHaveTextContent("1");

    pathname = "/d1/edit";
    rerender(<DashboardWorkspace id="d1" editMode={true} />);
    expect(screen.getByLabelText("Hide parameters")).toHaveTextContent("1");
  });

  it("toggles public sharing from the edit toolbar", async () => {
    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);

    expect(screen.getByTestId("assign-panel")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("toggle-public"));
    expect(mockUpdateMutate).toHaveBeenCalledWith({ id: "d1", isPublic: true });
  });

  it("hides the sharing sheet from non-admins", () => {
    mockUseSession.mockReturnValue({
      data: { user: { role: "creator", canWrite: true } },
    });
    pathname = "/d1/edit";
    render(<DashboardWorkspace id="d1" editMode={true} />);
    expect(screen.queryByTestId("assign-panel")).toBeNull();
  });

  it("Back returns to the dashboard list from view mode", async () => {
    render(<DashboardWorkspace id="d1" editMode={false} />);
    await userEvent.click(screen.getByText("Back"));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("dismissing the version banner stores the seen version", async () => {
    sessionStorage.setItem("__nb_dash_ver_d1", "1");
    const bumped = makeDashboard();
    bumped.version = 2;
    dashboard = bumped;

    render(<DashboardWorkspace id="d1" editMode={false} />);
    await userEvent.click(screen.getByText("Refresh"));

    expect(sessionStorage.getItem("__nb_dash_ver_d1")).toBe("2");
    expect(screen.queryByText(/Dashboard updated by/)).toBeNull();
  });
});
