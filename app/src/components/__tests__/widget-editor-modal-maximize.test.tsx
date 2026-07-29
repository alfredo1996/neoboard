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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";

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

vi.mock("@neoboard/components", () => {
  const passthrough = ({ children }: React.PropsWithChildren) => (
    <>{children}</>
  );
  return {
    Dialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
      open ? <div>{children}</div> : null,
    DialogContent: ({
      children,
      className,
    }: React.PropsWithChildren<{ className?: string }>) => (
      <div role="dialog" className={className}>
        {children}
      </div>
    ),
    DialogHeader: ({ children }: React.PropsWithChildren) => (
      <div>{children}</div>
    ),
    DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
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
    getDefaultChartSettings: () => ({}),
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
    data: undefined,
  }),
}));
vi.mock("@/hooks/use-widget-templates", () => ({
  useWidgetTemplates: () => ({ data: [], isLoading: false }),
  useCreateWidgetTemplate: () => ({ mutateAsync: vi.fn() }),
  useUpdateWidgetTemplate: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../widget-editor/use-auto-preview", () => ({
  useAutoPreview: () => ({ handlePreview: vi.fn(), saveStatus: "idle" }),
}));
vi.mock("../widget-editor/use-widget-save", () => ({
  useBuildWidgetForSave: () => () => ({}),
}));

// Heavy children stubbed — this test is about the modal's layout, not theirs.
vi.mock("../widget-editor/widget-preview-panel", () => ({
  WidgetPreviewPanel: () => <div data-testid="widget-preview" />,
}));
vi.mock("../widget-editor/chart-type-selector", () => ({
  ChartTypeSelector: () => <div />,
}));
vi.mock("../widget-editor/form-fields-editor", () => ({
  FormFieldsEditor: () => <div />,
}));
vi.mock("../widget-editor/parameter-config-section", () => ({
  ParameterConfigSection: () => <div />,
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
  DatabaseSelector: () => <div />,
}));
vi.mock("../widget-editor/template-browser", () => ({
  TemplateBrowser: () => <div />,
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
