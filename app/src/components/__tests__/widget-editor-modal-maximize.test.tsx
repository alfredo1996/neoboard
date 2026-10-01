/**
 * #1374 — editor maximize toggle.
 *
 * The modal body is a two-column grid (`minmax(0,1fr) minmax(0,1fr)`), so the
 * editor and the preview are side by side, not stacked. Maximizing therefore
 * has to collapse the grid to one column AND unmount the preview — chart/graph
 * renderers measure their container, and NVL's WebGL canvas does not survive a
 * 0-height mount, so `display:none` is not an option.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import type { WidgetTemplate } from "@/lib/db/schema";
import type { ConnectionListItem } from "@/hooks/use-connections";
import type { ChartTypeSelectorProps } from "../widget-editor/chart-type-selector";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = (props: Record<string, unknown>) => (
      <div
        data-testid="query-editor"
        data-class-name={String(props.className ?? "")}
      />
    );
    Stub.displayName = "QueryEditorStub";
    return Stub;
  },
}));

/** The dismiss handlers the modal hands its Dialog and DialogContent (#1952).
 *  Radix closes on Escape and on the close button by calling the Dialog's
 *  `onOpenChange(false)`, so that one stands for both. */
const { dismiss, selector, browser, updateTemplate, seed, connectorList } =
  vi.hoisted(() => ({
    dismiss: {} as Record<string, ((e?: unknown) => void) | undefined>,
    /** The chart-type picker's props, as the user reaches them. */
    selector: {} as Partial<ChartTypeSelectorProps>,
    /** From Template's pick, as the user reaches it. */
    browser: {} as { onApply?: (t: WidgetTemplate) => void },
    /** Edit Template's save (#2076). */
    updateTemplate: vi.fn(),
    /** What Test Seed Query returns, and the options the preview is given (#2104). */
    seed: {} as { data?: unknown; previewOptions?: unknown },
    /** What useConnectors answers. One object, so `data` keeps its identity
     *  across renders as TanStack's does. */
    connectorList: { data: [] as unknown[] },
  }));

vi.mock("@neoboard/components", () => {
  const passthrough = ({ children }: React.PropsWithChildren) => (
    <>{children}</>
  );
  // As in Radix: the root always renders its children, and only the content
  // goes when it closes — so a sibling of the content outlives it (#2054).
  const OpenContext = React.createContext(false);
  return {
    Dialog: ({
      open,
      onOpenChange,
      children,
    }: React.PropsWithChildren<{
      open: boolean;
      onOpenChange?: (open: boolean) => void;
    }>) => {
      dismiss.onOpenChange = onOpenChange as (e?: unknown) => void;
      return (
        <OpenContext.Provider value={open}>{children}</OpenContext.Provider>
      );
    },
    ConfirmDialog: ({
      open,
      onOpenChange,
      title,
      confirmText,
      cancelText,
      onConfirm,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      title: string;
      confirmText: string;
      cancelText: string;
      onConfirm: () => void;
    }) =>
      open ? (
        <div role="alertdialog" aria-label={title}>
          <button type="button" onClick={() => onOpenChange(false)}>
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmText}
          </button>
        </div>
      ) : null,
    DialogContent: ({
      children,
      className,
      onPointerDownOutside,
      onInteractOutside,
      onFocusOutside,
      onEscapeKeyDown,
    }: React.PropsWithChildren<{
      className?: string;
      onPointerDownOutside?: () => void;
      onInteractOutside?: () => void;
      onFocusOutside?: () => void;
      onEscapeKeyDown?: (e: KeyboardEvent) => void;
    }>) => {
      Object.assign(dismiss, {
        onPointerDownOutside,
        onInteractOutside,
        onFocusOutside,
        onEscapeKeyDown,
      });
      return React.useContext(OpenContext) ? (
        <div role="dialog" className={className}>
          {children}
        </div>
      ) : null;
    },
    DialogHeader: ({ children }: React.PropsWithChildren) => (
      <div>{children}</div>
    ),
    DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
    DialogDescription: ({ children }: React.PropsWithChildren) => (
      <p>{children}</p>
    ),
    DialogFooter: ({ children }: React.PropsWithChildren) => (
      <div data-testid="modal-footer">{children}</div>
    ),
    Button: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <button {...props}>{children}</button>
    ),
    LoadingButton: ({
      children,
      loading,
      loadingText,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <button {...props}>{loading ? String(loadingText) : children}</button>
    ),
    Input: (props: Record<string, unknown>) => <input {...props} />,
    Label: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <label {...props}>{children}</label>
    ),
    Checkbox: (props: Record<string, unknown>) => (
      <input type="checkbox" {...props} />
    ),
    Alert: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div role="alert" {...props}>
        {children}
      </div>
    ),
    AlertTitle: passthrough,
    AlertDescription: passthrough,
    Tooltip: passthrough,
    TooltipTrigger: passthrough,
    TooltipContent: passthrough,
    Popover: passthrough,
    PopoverTrigger: passthrough,
    PopoverContent: passthrough,
    DropdownMenu: passthrough,
    DropdownMenuTrigger: passthrough,
    DropdownMenuContent: passthrough,
    DropdownMenuItem: ({ children }: React.PropsWithChildren) => (
      <div>{children}</div>
    ),
    // Only the Data tab matters here — that's where the query editor lives.
    ChartSettingsPanel: ({ dataTab }: { dataTab?: React.ReactNode }) => (
      <div data-testid="chart-settings">{dataTab}</div>
    ),
    ChartOptionsPanel: () => <div />,
    ColorScalePanel: () => <div />,
    // Per type, so a reset to another type's defaults shows (#2054).
    getDefaultChartSettings: (type: string) => ({ defaultsFor: type }),
  };
});

vi.mock("@/hooks/use-schema", () => ({
  useConnectionSchema: () => ({ isFetching: false, refreshSchema: vi.fn() }),
}));
vi.mock("@/stores/schema-store", () => ({ useSchemaStore: () => null }));
vi.mock("@/hooks/use-query-execution", () => ({
  useQueryExecution: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    data: seed.data,
  }),
}));
vi.mock("@/hooks/use-widget-templates", () => ({
  useWidgetTemplates: () => ({ data: [], isLoading: false }),
  useCreateWidgetTemplate: () => ({ mutateAsync: vi.fn() }),
  useUpdateWidgetTemplate: () => ({ mutateAsync: updateTemplate }),
}));
vi.mock("@/hooks/use-connectors", () => ({
  useConnectors: () => connectorList,
}));
vi.mock("../widget-editor/use-auto-preview", () => ({
  useAutoPreview: () => ({ handlePreview: vi.fn(), saveStatus: "idle" }),
}));
// Heavy children stubbed — this test is about the modal's layout, not theirs.
vi.mock("../widget-editor/widget-preview-panel", () => ({
  WidgetPreviewPanel: ({
    isLabMode,
    seedPreviewOptions,
  }: {
    isLabMode?: boolean;
    seedPreviewOptions?: unknown;
  }) => {
    seed.previewOptions = seedPreviewOptions;
    return (
      <div data-testid="widget-preview" data-lab-mode={String(isLabMode)} />
    );
  },
}));
vi.mock("../widget-editor/chart-type-selector", () => ({
  ChartTypeSelector: (props: ChartTypeSelectorProps) => {
    Object.assign(selector, props);
    return <div />;
  },
}));
vi.mock("../widget-editor/form-fields-editor", () => ({
  FormFieldsEditor: () => <div />,
}));
vi.mock("../widget-editor/parameter-config-section", () => ({
  ParameterConfigSection: ({ isLabMode }: { isLabMode?: boolean }) => (
    <div data-testid="param-config" data-lab-mode={String(isLabMode)} />
  ),
}));
vi.mock("../widget-editor/action-rules-editor", () => ({
  ActionRulesEditor: () => <div />,
}));
vi.mock("../widget-editor/styling-rules-editor", () => ({
  StylingRulesEditor: () => <div />,
}));
vi.mock("../widget-editor/transform-editor", () => ({
  TransformEditor: () => <div />,
}));
vi.mock("../widget-editor/database-selector", () => ({
  DatabaseSelector: ({ database }: { database?: string }) => (
    <div data-testid="database-selector" data-database={database} />
  ),
}));
vi.mock("../widget-editor/template-browser", () => ({
  TemplateBrowser: ({ onApply }: { onApply: (t: WidgetTemplate) => void }) => {
    browser.onApply = onApply;
    return <div />;
  },
}));
vi.mock("../widget-editor/advanced-caching-section", () => ({
  AdvancedCachingSection: () => <div />,
}));
vi.mock("../widget-editor/advanced-interactivity-section", () => ({
  AdvancedInteractivitySection: () => <div />,
}));
vi.mock("../widget-editor/advanced-styling-section", () => ({
  AdvancedStylingSection: () => <div />,
}));
vi.mock("../widget-editor/advanced-form-refresh-section", () => ({
  AdvancedFormRefreshSection: () => <div />,
}));
vi.mock("../widget-editor/lab-metadata-form", () => ({
  LabMetadataForm: () => <div />,
}));

const { WidgetEditorModal } = await import("../widget-editor-modal");

function renderModal() {
  return render(
    <WidgetEditorModal
      open
      onOpenChange={vi.fn()}
      mode="add"
      connections={[]}
      onSave={vi.fn()}
    />,
  );
}

/** The grid lives on the only element carrying an inline gridTemplateColumns. */
function gridColumns(): string {
  const body = document.querySelector<HTMLElement>(
    '[style*="grid-template-columns"]',
  );
  expect(body).not.toBeNull();
  return body!.style.gridTemplateColumns;
}

function footerButtons() {
  return {
    cancel: screen.queryByRole("button", { name: "Cancel" }),
    save: screen.queryByRole("button", { name: "Add Widget" }),
  };
}

describe("WidgetEditorModal — editor maximize (#1374)", () => {
  beforeEach(() => {
    useWidgetEditorStore.getState().resetForAdd();
  });

  it("starts collapsed: two columns, preview mounted, editor at min height", () => {
    renderModal();
    expect(gridColumns()).toBe("minmax(0, 1fr) minmax(0, 1fr)");
    expect(screen.getByTestId("widget-preview")).toBeInTheDocument();
    expect(screen.getByTestId("query-editor")).toHaveAttribute(
      "data-class-name",
      "min-h-[220px]",
    );
  });

  it("unmounts the preview and collapses to one column when maximized", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: /expand editor/i }));

    // Unmounted, not hidden — renderers must re-measure from scratch on the
    // way back rather than wake up at 0x0.
    expect(screen.queryByTestId("widget-preview")).not.toBeInTheDocument();
    expect(gridColumns()).toBe("minmax(0, 1fr)");
    expect(
      screen.getByTestId("query-editor").getAttribute("data-class-name"),
    ).toContain("h-[70vh]");
  });

  it("restores both panes when toggled back", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: /expand editor/i }));
    await user.click(screen.getByRole("button", { name: /collapse editor/i }));

    expect(screen.getByTestId("widget-preview")).toBeInTheDocument();
    expect(gridColumns()).toBe("minmax(0, 1fr) minmax(0, 1fr)");
    expect(screen.getByTestId("query-editor")).toHaveAttribute(
      "data-class-name",
      "min-h-[220px]",
    );
  });

  it("un-maximizes when switching to a chart type that has no query editor", async () => {
    // The toggle lives in the query editor's header, and that header is not
    // rendered for parameter-select / markdown / iframe widgets. Leaving the
    // layout maximized would strand the user: no preview, one column, and no
    // control anywhere to get back.
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: /expand editor/i }));
    expect(screen.queryByTestId("widget-preview")).not.toBeInTheDocument();

    useWidgetEditorStore.getState().setChartType("markdown");

    expect(await screen.findByTestId("widget-preview")).toBeInTheDocument();
    expect(gridColumns()).toBe("minmax(0, 1fr) minmax(0, 1fr)");
  });

  it("keeps the footer actions rendered in both states (#1041)", async () => {
    const user = userEvent.setup();
    renderModal();

    expect(footerButtons().cancel).toBeInTheDocument();
    expect(footerButtons().save).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand editor/i }));

    expect(footerButtons().cancel).toBeInTheDocument();
    expect(footerButtons().save).toBeInTheDocument();
    // The footer must stay a sibling of the scrollable body, not inside it.
    const footer = screen.getByTestId("modal-footer");
    const body = document.querySelector('[style*="grid-template-columns"]');
    expect(body!.contains(footer)).toBe(false);
  });
});

// #1824: a selector lists its options from its saved database, so the editor
// shows that database, where it can be seen and set back to Default.
describe("WidgetEditorModal — a parameter selector's database (#1824)", () => {
  function renderSelector(parameterType: string) {
    render(
      <WidgetEditorModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        widget={{
          id: "w-select",
          chartType: "parameter-select",
          connectionId: "c1",
          database: "sales",
          query: "",
          settings: {
            chartOptions: {
              parameterName: "db",
              parameterType,
              seedQuery: "SELECT 1",
            },
          },
        }}
        connections={[
          {
            id: "c1",
            name: "PostgreSQL",
            type: "postgresql",
            allowPerCardDb: true,
            visibility: "private",
            isOwner: true,
            createdAt: "",
            updatedAt: "",
          },
        ]}
        onSave={vi.fn()}
      />,
    );
  }

  it("shows the database an option list is saved on", () => {
    renderSelector("select");
    expect(screen.getByTestId("database-selector")).toHaveAttribute(
      "data-database",
      "sales",
    );
  });

  it("shows no database for a selector without an option list", () => {
    renderSelector("text");
    expect(screen.queryByTestId("database-selector")).not.toBeInTheDocument();
  });
});

// #1951: the Widget Library has no dashboard, and the parameter store still
// holds the last one's values, so neither the Test Seed Query check nor the
// preview may bind a cascade parent there.
describe("WidgetEditorModal — no dashboard in the Widget Library (#1951)", () => {
  it.each([
    ["lab-create", "true"],
    ["add", "false"],
  ] as const)(
    "in %s mode tells the selector editor isLabMode=%s",
    (mode, lab) => {
      render(
        <WidgetEditorModal
          open
          onOpenChange={vi.fn()}
          mode={mode}
          connections={[]}
          onSave={vi.fn()}
        />,
      );
      act(() =>
        useWidgetEditorStore.getState().setChartType("parameter-select"),
      );
      expect(screen.getByTestId("param-config")).toHaveAttribute(
        "data-lab-mode",
        lab,
      );
      expect(screen.getByTestId("widget-preview")).toHaveAttribute(
        "data-lab-mode",
        lab,
      );
    },
  );
});

// #1952: the editor closed on any interaction outside it, and focus leaving
// counts — the card menu hands focus back to its trigger as it closes, so Edit
// Widget opened an editor that dismissed itself at once. The E2E test in
// widgets.spec.ts shows the behaviour; this pins which handler does it.
describe("WidgetEditorModal — what dismisses it (#1952)", () => {
  it("closes on a pointer-down outside it (#404), and not on focus leaving", () => {
    const onOpenChange = vi.fn();
    render(
      <WidgetEditorModal
        open
        onOpenChange={onOpenChange}
        mode="add"
        connections={[]}
        onSave={vi.fn()}
      />,
    );

    expect(dismiss.onInteractOutside).toBeUndefined();
    expect(dismiss.onFocusOutside).toBeUndefined();
    dismiss.onPointerDownOutside?.();
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});

// #2054: Escape, a click outside, the close button and Cancel dropped every
// edit without asking. With something changed since the editor opened they
// ask first; with nothing changed they close at once, as before.
describe("WidgetEditorModal — asks before dropping unsaved edits (#2054)", () => {
  const CONFIRM = "Discard unsaved changes?";

  beforeEach(() => {
    useWidgetEditorStore.getState().resetForAdd();
  });

  /** The editor takes what it opened with once opening has settled. */
  async function settle() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  async function openEditor(
    props: Partial<React.ComponentProps<typeof WidgetEditorModal>> = {},
  ) {
    const onOpenChange = vi.fn();
    render(
      <WidgetEditorModal
        open
        onOpenChange={onOpenChange}
        mode="add"
        connections={[]}
        onSave={vi.fn()}
        {...props}
      />,
    );
    await settle();
    return onOpenChange;
  }

  const closePaths = [
    [
      "Escape or the close button",
      async () => act(() => dismiss.onOpenChange?.(false)),
    ],
    [
      "a pointer-down outside",
      async () => act(() => dismiss.onPointerDownOutside?.()),
    ],
    [
      "Cancel",
      () => userEvent.click(screen.getByRole("button", { name: "Cancel" })),
    ],
  ] as const;

  it.each(closePaths)(
    "an unchanged editor closes at once on %s",
    async (_path, close) => {
      const onOpenChange = await openEditor();
      await close();
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    },
  );

  it.each(closePaths)(
    "with a changed query, %s asks first and keeps the editor open",
    async (_path, close) => {
      const onOpenChange = await openEditor();
      act(() => useWidgetEditorStore.getState().setQuery("MATCH (n) RETURN n"));
      await close();
      expect(
        screen.getByRole("alertdialog", { name: CONFIRM }),
      ).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    },
  );

  it("Discard closes the editor", async () => {
    const onOpenChange = await openEditor();
    act(() => useWidgetEditorStore.getState().setQuery("MATCH (n) RETURN n"));
    await act(async () => dismiss.onOpenChange?.(false));

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("Keep editing returns to the editor with the edits intact", async () => {
    const onOpenChange = await openEditor();
    act(() => useWidgetEditorStore.getState().setQuery("MATCH (n) RETURN n"));
    await act(async () => dismiss.onOpenChange?.(false));

    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(useWidgetEditorStore.getState().query).toBe("MATCH (n) RETURN n");
  });

  it("an Edit Widget left as it opened closes without asking", async () => {
    const onOpenChange = await openEditor({
      mode: "edit",
      widget: {
        id: "w-2054",
        chartType: "table",
        connectionId: "c1",
        query: "MATCH (m:Movie) RETURN m.title AS title",
        settings: { title: "Movies", chartOptions: { pageSize: 20 } },
      },
    });
    await act(async () => dismiss.onOpenChange?.(false));
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("the chart-options reset that opening runs is not an edit", async () => {
    // The last editor left a bar chart in the store; Create Template opens on
    // a table, and puts a table's default options in on the way.
    useWidgetEditorStore.getState().setChartType("bar");
    const onOpenChange = await openEditor({ mode: "lab-create" });
    await act(async () => dismiss.onOpenChange?.(false));
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("an edit in the rules step counts, and Keep editing stays on that step", async () => {
    const onOpenChange = await openEditor();
    act(() => {
      const s = useWidgetEditorStore.getState();
      s.setDialogStep("rules");
      s.setActionRules([
        {
          id: "r1",
          type: "set-parameter",
          parameterMapping: { parameterName: "movie", sourceField: "title" },
        },
      ]);
    });
    await act(async () => dismiss.onOpenChange?.(false));
    expect(
      screen.getByRole("alertdialog", { name: CONFIRM }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(useWidgetEditorStore.getState().dialogStep).toBe("rules");
    expect(useWidgetEditorStore.getState().actionRules).toHaveLength(1);
  });

  // Radix hears Escape on the document before an inner widget does, so an
  // open suggestion list (CreatableCombobox: the rules step's Parameter Name,
  // a styling or transform value) lost the key to the editor. The E2E in
  // widgets.spec.ts shows it end to end; this pins who keeps the key.
  it.each([
    ["an open suggestion list keeps it", "combobox", "true", true],
    ["a closed combobox passes it on", "combobox", "false", false],
    ["an expanded accordion header passes it on", "button", "true", false],
  ] as const)("Escape from %s", async (_what, role, expanded, kept) => {
    await openEditor();
    const el = document.createElement(role === "combobox" ? "input" : "button");
    el.setAttribute("role", role);
    el.setAttribute("aria-expanded", expanded);
    document.body.appendChild(el);
    el.addEventListener("keydown", (e) => dismiss.onEscapeKeyDown?.(e));
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });

    el.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(kept);
    el.remove();
  });

  it("a save that closes the editor takes the confirmation with it", async () => {
    const props = {
      onOpenChange: vi.fn(),
      mode: "add" as const,
      connections: [],
      onSave: vi.fn(),
    };
    const { rerender } = render(<WidgetEditorModal open {...props} />);
    await settle();
    act(() => useWidgetEditorStore.getState().setQuery("MATCH (n) RETURN n"));
    await act(async () => dismiss.onOpenChange?.(false));
    expect(
      screen.getByRole("alertdialog", { name: CONFIRM }),
    ).toBeInTheDocument();

    // Run-and-save's shortcut, or a save already under way, still lands.
    await userEvent.click(screen.getByRole("button", { name: "Add Widget" }));
    expect(props.onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    rerender(<WidgetEditorModal open={false} {...props} />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    rerender(<WidgetEditorModal open {...props} />);
    await settle();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("Keep editing hands focus back to where it was", async () => {
    await openEditor();
    const expand = screen.getByRole("button", { name: /expand editor/i });
    act(() => {
      useWidgetEditorStore.getState().setQuery("MATCH (n) RETURN n");
      expand.focus();
    });
    await act(async () => dismiss.onOpenChange?.(false));

    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    await waitFor(() => expect(expand).toHaveFocus());
  });
});

// #2076: Edit Template loaded the chart type, query, title and chart options
// alone, and the chart-type effect then put the options back to the type's
// defaults whenever the store's last chart type was another one; its save
// wrote all of that over the template. Use in Dashboard dropped the styling
// rules, click action and transforms too.
describe("WidgetEditorModal — a template opens as it was saved (#2076)", () => {
  const SETTINGS = {
    title: "Sales by region",
    chartOptions: { saved: true, orientation: "horizontal" },
    stylingConfig: {
      enabled: true,
      rules: [{ id: "s1", operator: ">", value: 10, color: "#dc2626" }],
    },
    clickAction: {
      type: "set-parameter",
      rules: [
        {
          id: "r1",
          type: "set-parameter",
          parameterMapping: { parameterName: "region", sourceField: "label" },
        },
      ],
    },
    transforms: [{ type: "sort", column: "value", direction: "desc" }],
    conditionalFormatting: {
      colorScales: [
        { column: "value", minColor: "#ffffff", maxColor: "#000000" },
      ],
    },
    // Not built by the lab's save, and kept by it all the same.
    enableCache: false,
  };
  const TEMPLATE: WidgetTemplate = {
    id: "t-2076",
    name: "Regional sales",
    description: "Sales per region",
    tags: ["sales"],
    chartType: "bar",
    connectorType: null,
    connectionId: null,
    query: "RETURN 'north' AS label, 2 AS value",
    params: null,
    settings: SETTINGS,
    previewImageUrl: null,
    createdBy: "u1",
    tenantId: "default",
    createdAt: null,
    updatedAt: null,
  };

  function connection(id: string, type: string): ConnectionListItem {
    return {
      id,
      name: id,
      type,
      visibility: "private",
      isOwner: true,
      createdAt: "",
      updatedAt: "",
    } as ConnectionListItem;
  }

  async function settle() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  /** As the Widget Library does: mounted closed, then opened. */
  async function openEditor(
    props: Partial<React.ComponentProps<typeof WidgetEditorModal>> = {},
  ) {
    const all = {
      onOpenChange: vi.fn(),
      mode: "lab-edit" as const,
      template: TEMPLATE,
      connections: [],
      onSave: vi.fn(),
      ...props,
    };
    const { rerender } = render(<WidgetEditorModal {...all} open={false} />);
    rerender(<WidgetEditorModal {...all} open />);
    await settle();
    return all.onOpenChange;
  }

  function expectTemplateLoaded() {
    const s = useWidgetEditorStore.getState();
    expect(s.chartType).toBe("bar");
    expect(s.chartOptions).toEqual(SETTINGS.chartOptions);
    expect(s.stylingEnabled).toBe(true);
    expect(s.stylingRules).toEqual(SETTINGS.stylingConfig.rules);
    expect(s.clickActionEnabled).toBe(true);
    expect(s.actionRules).toEqual(SETTINGS.clickAction.rules);
    expect(s.transforms).toEqual(SETTINGS.transforms);
    expect(s.colorScales).toEqual(SETTINGS.conditionalFormatting.colorScales);
  }

  beforeEach(() => {
    // A fresh Widget Library page: the store is on a table.
    useWidgetEditorStore.getState().resetForAdd();
    updateTemplate.mockReset();
  });

  it("Edit Template keeps its chart options while the store is on another chart type", async () => {
    expect(useWidgetEditorStore.getState().chartType).toBe("table");
    await openEditor();
    expect(useWidgetEditorStore.getState().chartOptions).toEqual(
      SETTINGS.chartOptions,
    );
  });

  it("Edit Template opens with its styling rules, click action, transforms and color scales", async () => {
    await openEditor();
    expectTemplateLoaded();
    const s = useWidgetEditorStore.getState();
    expect(s.labName).toBe("Regional sales");
    expect(s.labDescription).toBe("Sales per region");
    expect(s.labTagsInput).toBe("sales");
    expect(s.templateId).toBeUndefined();
  });

  it("an untouched Edit Template saves back the settings it opened with", async () => {
    await openEditor();
    await userEvent.click(
      screen.getByRole("button", { name: "Save Template" }),
    );
    expect(updateTemplate).toHaveBeenCalledOnce();
    const [payload] = updateTemplate.mock.calls[0];
    expect(payload).toMatchObject({ id: "t-2076", chartType: "bar" });
    // Plus the two defaults it read in for the keys the template lacked.
    expect(payload.settings).toEqual({
      ...SETTINGS,
      cacheTtlMinutes: 5,
      transformsEnabled: true,
    });
  });

  it("an untouched Edit Template keeps a click action whose rules navigate to a page", async () => {
    // The Widget Library has no dashboard, so no pages to check the rule against.
    const clickAction = {
      type: "set-parameter",
      rules: [
        ...SETTINGS.clickAction.rules,
        { id: "r2", type: "navigate-to-page", targetPageId: "page-2" },
      ],
    };
    await openEditor({
      template: { ...TEMPLATE, settings: { ...SETTINGS, clickAction } },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Save Template" }),
    );
    expect(updateTemplate.mock.calls[0][0].settings.clickAction).toEqual(
      clickAction,
    );
  });

  it("Edit Template saves the caching and transforms toggles the user changed", async () => {
    await openEditor({
      template: {
        ...TEMPLATE,
        settings: { ...SETTINGS, enableCache: false, transformsEnabled: false },
      },
    });
    act(() => {
      const s = useWidgetEditorStore.getState();
      s.setEnableCache(true);
      s.setTransformsEnabled(true);
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Save Template" }),
    );
    expect(updateTemplate.mock.calls[0][0].settings).toMatchObject({
      enableCache: true,
      transformsEnabled: true,
    });
  });

  it("an unchanged Edit Template closes without the discard question (#2054)", async () => {
    const onOpenChange = await openEditor();
    await act(async () => dismiss.onOpenChange?.(false));
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it.each([
    ["add", {}],
    [
      "edit",
      {
        // On the store's chart type, so opening changes none.
        widget: {
          id: "w-2076",
          chartType: "table",
          connectionId: "c1",
          query: "RETURN 1",
          settings: { chartOptions: { pageSize: 20 } },
        },
      },
    ],
    ["lab-edit", {}],
    ["lab-create", {}],
  ] as const)(
    "in %s mode a chart-type change resets the options to the new type's defaults",
    async (mode, props) => {
      await openEditor({ mode, ...props });
      act(() => selector.onChartTypeChange?.("line"));
      expect(useWidgetEditorStore.getState().chartOptions).toEqual({
        defaultsFor: "line",
      });
    },
  );

  it("Use in Dashboard applies the template's styling rules, click action, transforms and color scales", async () => {
    await openEditor({
      mode: "add",
      template: undefined,
      initialTemplate: TEMPLATE,
    });
    await settle();
    expectTemplateLoaded();
    expect(useWidgetEditorStore.getState().templateId).toBe("t-2076");
  });

  // #2085: the template, fetched after opening, read as the user's edit.
  // A connection picked while the template is in flight survives the
  // template, so it is an edit too.
  const store = () => useWidgetEditorStore.getState();
  it.each([
    ["closes at once", false, undefined, undefined],
    [
      "asks first after a query change",
      true,
      undefined,
      () => store().setQuery("x"),
    ],
    [
      "asks first after an earlier connection pick",
      true,
      () => store().setConnectionId("c1"),
      undefined,
    ],
  ])(
    "Use in Dashboard with a template that arrives after opening %s",
    async (_what, edited, editBefore, editAfter) => {
      const all = {
        onOpenChange: vi.fn(),
        mode: "add" as const,
        connections: [],
        onSave: vi.fn(),
      };
      const { rerender } = render(<WidgetEditorModal {...all} open />);
      await settle();
      if (editBefore) act(editBefore);
      rerender(<WidgetEditorModal {...all} open initialTemplate={TEMPLATE} />);
      await settle();
      if (editAfter) act(editAfter);
      await act(async () => dismiss.onOpenChange?.(false));
      expect(screen.queryByRole("alertdialog") !== null).toBe(edited);
      expect(all.onOpenChange).toHaveBeenCalledTimes(edited ? 0 : 1);
    },
  );

  it.each([
    ["the template's own connection", "", { connectionId: "c2" }, "c2"],
    ["one of the template's connector", "", { connectorType: "beta" }, "c2"],
    ["the connection already chosen", "c1", { connectionId: "c2" }, "c1"],
    ["none without a match", "", { connectionId: "gone" }, ""],
  ] as const)(
    "From Template loads the whole template and runs on %s",
    async (_what, chosen, binding, expected) => {
      const updatedAt = new Date("2026-09-01T00:00:00Z");
      await openEditor({
        mode: "add",
        template: undefined,
        connections: [connection("c1", "alpha"), connection("c2", "beta")],
      });
      act(() => {
        const s = useWidgetEditorStore.getState();
        if (chosen) s.setConnectionId(chosen);
        s.setDialogStep("templates");
      });
      act(() => browser.onApply?.({ ...TEMPLATE, ...binding, updatedAt }));
      expectTemplateLoaded();
      const s = useWidgetEditorStore.getState();
      expect(s.connectionId).toBe(expected);
      expect(s.dialogStep).toBe("main");
      expect(s.templateId).toBe("t-2076");
      expect(s.templateSyncedAt).toBe(String(updatedAt));
    },
  );
});

// #2104: the preview maps seed rows as the dashboard selector does, so a
// label column that comes first is still the label.
describe("WidgetEditorModal — Test Seed Query preview (#2104)", () => {
  afterEach(() => {
    seed.data = undefined;
  });

  it("previews the label column when it comes before the value", () => {
    seed.data = { data: [{ label: "Heat", value: 7 }] };
    useWidgetEditorStore.getState().resetForAdd();
    useWidgetEditorStore.getState().setChartType("parameter-select");
    renderModal();
    expect(seed.previewOptions).toEqual([
      { value: "7", label: "Heat", rawValue: 7 },
    ]);
  });
});

// #2068: the modal finds the selected connection's descriptor in useConnectors
// by type. That lookup is what carries supportsWrite to the picker and to the
// connection switch, so it is tested here and not only in the helper.
describe("WidgetEditorModal — the Form widget needs a connection that can write (#2068)", () => {
  const connections = [
    { id: "c-rw", type: "rw" },
    { id: "c-ro", type: "ro" },
  ].map(
    ({ id, type }) =>
      ({
        id,
        name: id,
        type,
        visibility: "private",
        isOwner: true,
        createdAt: "",
        updatedAt: "",
      }) as ConnectionListItem,
  );

  beforeEach(() => {
    useWidgetEditorStore.getState().resetForAdd();
    connectorList.data = [
      { type: "rw", supportsWrite: true },
      { type: "ro", supportsWrite: false },
    ];
  });
  afterEach(() => {
    connectorList.data = [];
  });

  function editWidget(chartType: string, connectionId: string) {
    render(
      <WidgetEditorModal
        open
        onOpenChange={vi.fn()}
        mode="edit"
        widget={{
          id: "w-2068",
          chartType,
          connectionId,
          query: "",
          settings: {},
        }}
        connections={connections}
        onSave={vi.fn()}
      />,
    );
  }

  it.each([
    ["c-rw", true],
    ["c-ro", false],
  ])("the picker on %s offers Form: %s", (connectionId, offered) => {
    editWidget("table", connectionId);
    expect(selector.compatibleChartTypes?.includes("form")).toBe(offered);
  });

  it("moving a form to a connection that cannot write falls back to Table", () => {
    editWidget("form", "c-rw");
    expect(useWidgetEditorStore.getState().chartType).toBe("form");
    act(() => selector.onConnectionChange?.("c-ro"));
    expect(useWidgetEditorStore.getState().chartType).toBe("table");
  });
});
