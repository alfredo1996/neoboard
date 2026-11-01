/**
 * #2388 — where each widget's options sit, through the REAL settings panel and
 * `chartOptionGroups` (widget-editor-modal-maximize.test.tsx stubs both).
 * Each case reads the DOM a user sees and the widget that a Save hands back.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import type { DashboardWidget } from "@/lib/db/schema";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = () => <div data-testid="query-editor" />;
    Stub.displayName = "QueryEditorStub";
    return Stub;
  },
}));
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
vi.mock("@/hooks/use-connectors", () => ({
  useConnectors: () => ({ data: [] }),
}));
vi.mock("../widget-editor/use-auto-preview", () => ({
  useAutoPreview: () => ({ handlePreview: vi.fn(), saveStatus: "idle" }),
}));
vi.mock("../widget-editor/widget-preview-panel", () => ({
  WidgetPreviewPanel: () => <div />,
}));
vi.mock("../widget-editor/template-browser", () => ({
  TemplateBrowser: ({ onApply }: { onApply: (t: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onApply({
          id: "t1",
          chartType: "table",
          query: "SELECT 1",
          connectionId: "c1",
          settings: {
            cardBackground: "rose",
            description: "From the template",
          },
        })
      }
    >
      Apply stub template
    </button>
  ),
}));
vi.mock("../widget-editor/transform-editor", () => ({
  TransformEditor: () => <div />,
}));

const { WidgetEditorModal } = await import("../widget-editor-modal");

const CONNECTION = {
  id: "c1",
  name: "Main",
  type: "postgresql",
  allowPerCardDb: false,
  visibility: "private",
  isOwner: true,
  displayAddress: null,
  widgetCount: 0,
  createdAt: "",
  updatedAt: "",
};

function renderEditor(
  widget: Partial<DashboardWidget> & { chartType: string },
  props: { mode?: "edit" | "lab-create" | "add" } = {},
) {
  const onSave = vi.fn();
  render(
    <WidgetEditorModal
      open
      onOpenChange={vi.fn()}
      mode={props.mode ?? "edit"}
      widget={{ id: "w1", connectionId: "c1", query: "", ...widget } as never}
      connections={[CONNECTION] as never}
      canWrite
      onSave={onSave}
    />,
  );
  return onSave;
}

const pane = () => screen.getByTestId("editor-pane");
const groupNames = () =>
  Array.from(pane().querySelectorAll("[data-group]")).map((g) =>
    g.getAttribute("data-group"),
  );
const group = (name: string) =>
  pane().querySelector<HTMLElement>(`[data-group="${name}"]`)!;

async function openSection(name: string) {
  await userEvent.click(screen.getByRole("tab", { name }));
}

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
  useWidgetEditorStore.getState().resetForAdd();
});

describe("WidgetEditorModal — option placement through the real panel (#2388)", () => {
  it("a saved markdown widget opens with its text in Content and saves every chartOptions key back", async () => {
    const chartOptions = { content: "# Saved\n\ntext", futureKey: 7 };
    const onSave = renderEditor({
      chartType: "markdown",
      connectionId: undefined,
      settings: { chartOptions },
    });
    expect(screen.getByRole("tab", { name: "Content" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(pane()).getByRole("textbox")).toHaveValue("# Saved\n\ntext");

    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(onSave.mock.calls[0][0].settings.chartOptions).toEqual(chartOptions);
  });

  it("a markdown widget has Content and Style; Text size and Alignment are in Style, and a save without them adds none (#2392)", async () => {
    const chartOptions = { content: "# Saved" };
    const onSave = renderEditor({
      chartType: "markdown",
      connectionId: undefined,
      settings: { chartOptions },
    });
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Content",
      "Style",
    ]);
    await openSection("Style");
    const text = within(group("Text"));
    expect(text.getByRole("radio", { name: "Medium" })).toHaveAttribute(
      "data-state",
      "on",
    );
    expect(text.getByRole("radio", { name: "Left" })).toHaveAttribute(
      "data-state",
      "on",
    );

    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(onSave.mock.calls[0][0].settings.chartOptions).toEqual(chartOptions);
  });

  it("a saved Off plus Forever opens as Forever, and an untouched save leaves both stored values", async () => {
    const onSave = renderEditor({
      chartType: "bar",
      query: "SELECT 1",
      settings: { enableCache: false, chartOptions: { cacheMode: "forever" } },
    });
    await openSection("Behavior");
    expect(screen.getByRole("radio", { name: "Forever" })).toHaveAttribute(
      "data-state",
      "on",
    );

    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    const saved = onSave.mock.calls[0][0].settings;
    expect(saved.enableCache).toBe(false);
    expect(saved.chartOptions.cacheMode).toBe("forever");
  });

  it("a form's button label is in Style; its success message and reset are in Behavior", async () => {
    renderEditor({ chartType: "form", settings: { chartOptions: {} } });
    await openSection("Style");
    expect(
      within(group("Submit button")).getByLabelText("Submit button text"),
    ).toBeInTheDocument();
    await openSection("Behavior");
    const after = within(group("After submit"));
    expect(after.getByLabelText("Success message")).toBeInTheDocument();
    expect(after.getByLabelText("Reset on success")).toBeInTheDocument();
    expect(screen.queryByLabelText("Submit button text")).toBeNull();
  });

  it("a filter opens on Data with Parameter Name first, and its Connection before the Seed Query that needs it", async () => {
    renderEditor({
      chartType: "parameter-select",
      settings: {
        chartOptions: { parameterName: "region", parameterType: "select" },
      },
    });
    expect(groupNames()[0]).toBe("Filter");
    const controls = Array.from(
      pane().querySelectorAll<HTMLElement>("input, textarea, [role=combobox]"),
    );
    expect(controls[0]).toHaveAccessibleName("Parameter Name");

    const order = Array.from(pane().querySelectorAll("label")).map(
      (l) => l.textContent,
    );
    expect(order.indexOf("Connection")).toBeGreaterThan(-1);
    expect(order.indexOf("Connection")).toBeLessThan(
      order.indexOf("Seed Query"),
    );
    expect(groupNames()).not.toContain("Connection");
  });

  it("the Widget Library puts the Template fields first in Data", () => {
    renderEditor(
      { chartType: "bar", query: "SELECT 1" },
      { mode: "lab-create" },
    );
    expect(groupNames()[0]).toBe("Template");
    expect(groupNames()).toContain("Query");
  });

  it("a Style search that misses every group, Rules included, says the rest is in Behavior", async () => {
    renderEditor({ chartType: "bar", query: "SELECT 1", settings: {} });
    await openSection("Style");
    expect(groupNames()).toContain("Rules");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Search options" }),
      "refresh",
    );
    expect(groupNames()).toEqual([]);
    expect(screen.getByText(/The rest is in Behavior/)).toBeInTheDocument();
  });
});

describe("WidgetEditorModal — a template carries the card options (#2394)", () => {
  it("applying a template loads its background and description", async () => {
    renderEditor({ chartType: "table" }, { mode: "add" });
    useWidgetEditorStore.getState().setDialogStep("templates");
    await userEvent.click(
      await screen.findByRole("button", { name: "Apply stub template" }),
    );
    const st = useWidgetEditorStore.getState();
    expect(st.cardBackground).toBe("rose");
    expect(st.description).toBe("From the template");
  });
});
