/**
 * #1717 — a widget's own params travel with its templates. The guided builder
 * binds its filter value in `params`, so a template saved from the Widget Lab,
 * loaded for editing, or applied to a new widget must carry them — otherwise
 * the query waits for a parameter nothing on the dashboard supplies.
 *
 * The mocks are the maximize test's harness: the modal with its heavy
 * children stubbed.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import type { WidgetTemplate } from "@/lib/db/schema";

const templates = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));

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
  useCreateWidgetTemplate: () => ({ mutateAsync: templates.create }),
  useUpdateWidgetTemplate: () => ({ mutateAsync: templates.update }),
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

const QUERY = "MATCH (n:Movie) WHERE n.released > $param_released RETURN n";
const template = {
  id: "t1",
  name: "Recent movies",
  chartType: "bar",
  connectorType: "neo4j",
  query: QUERY,
  params: { param_released: 2000 },
  settings: {},
  tags: [],
  updatedAt: new Date("2026-09-01"),
} as unknown as WidgetTemplate;

function renderModal(
  props: Partial<React.ComponentProps<typeof WidgetEditorModal>>,
) {
  return render(
    <WidgetEditorModal
      open
      onOpenChange={vi.fn()}
      mode="add"
      connections={[]}
      onSave={vi.fn()}
      {...props}
    />,
  );
}

describe("WidgetEditorModal — template params (#1717)", () => {
  beforeEach(() => {
    useWidgetEditorStore.getState().resetForAdd();
    templates.create.mockReset().mockResolvedValue({});
    templates.update.mockReset().mockResolvedValue({});
  });

  it("creates a Widget Lab template with the params its query references", async () => {
    const user = userEvent.setup();
    renderModal({ mode: "lab-create" });
    act(() => {
      const store = useWidgetEditorStore.getState();
      store.setLabName("Recent movies");
      store.setQuery(QUERY);
      store.setParams({ param_released: 2000, param_edited_away: 1 });
    });

    await user.click(screen.getByRole("button", { name: "Create Template" }));

    expect(templates.create).toHaveBeenCalledWith(
      expect.objectContaining({
        query: QUERY,
        params: { param_released: 2000 },
      }),
    );
  });

  it("loads a template's params for editing and saves them back", async () => {
    const user = userEvent.setup();
    renderModal({ mode: "lab-edit", template });
    expect(useWidgetEditorStore.getState().params).toEqual({
      param_released: 2000,
    });

    await user.click(screen.getByRole("button", { name: "Save Template" }));

    expect(templates.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t1", params: { param_released: 2000 } }),
    );
  });

  it("applies a template's params to a new widget", async () => {
    renderModal({ mode: "add", initialTemplate: template });

    await waitFor(() =>
      expect(useWidgetEditorStore.getState().query).toBe(QUERY),
    );
    expect(useWidgetEditorStore.getState().params).toEqual({
      param_released: 2000,
    });
  });
});
