import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@neoboard/components", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Label: ({
    children,
    htmlFor,
  }: React.PropsWithChildren<{ htmlFor?: string }>) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
  Input: ({
    id,
    value,
    onChange,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      id={id}
      value={value}
      onChange={onChange}
      data-testid={id}
      {...props}
    />
  ),
  Select: ({
    children,
    value,
    onValueChange,
  }: React.PropsWithChildren<{
    value: string;
    onValueChange: (v: string) => void;
  }>) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
  SelectItem: ({
    children,
    value,
  }: React.PropsWithChildren<{ value: string }>) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
  Checkbox: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
  }) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      data-testid={id}
    />
  ),
  Textarea: ({
    id,
    value,
    onChange,
    ...props
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea
      id={id}
      value={value}
      onChange={onChange}
      data-testid={id}
      {...props}
    />
  ),
}));

vi.mock("lucide-react", () => {
  const Icon = () => <span />;
  return {
    Calendar: Icon,
    Type: Icon,
    ListFilter: Icon,
    SlidersHorizontal: Icon,
    GitBranch: Icon,
  };
});

const mockSetParamUIType = vi.fn();
const mockSetDateSub = vi.fn();
const mockSetMultiSelect = vi.fn();
const mockSetParamWidgetName = vi.fn();
const mockSetChartOptions = vi.fn();

let mockStoreState: Record<string, unknown> = {};

vi.mock("@/stores/widget-editor-store", () => ({
  useWidgetEditorStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector(mockStoreState),
}));

import { ParameterConfigSection } from "../parameter-config-section";

const baseSeedExecution = {
  isPending: false,
  isError: false,
  error: null,
  mutate: vi.fn(),
};

describe("ParameterConfigSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      paramUIType: "select",
      setParamUIType: mockSetParamUIType,
      dateSub: "single",
      setDateSub: mockSetDateSub,
      multiSelect: false,
      setMultiSelect: mockSetMultiSelect,
      paramWidgetName: "",
      setParamWidgetName: mockSetParamWidgetName,
      chartOptions: { seedQuery: "" },
      setChartOptions: mockSetChartOptions,
      connectionId: "conn-1",
    };
  });

  it("renders parameter type selector", () => {
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByText("Parameter Type")).toBeInTheDocument();
  });

  it("renders parameter name input", () => {
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByText("Parameter Name")).toBeInTheDocument();
  });

  it("calls setParamWidgetName on name change", () => {
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    fireEvent.change(screen.getByTestId("param-widget-name"), {
      target: { value: "country" },
    });
    expect(mockSetParamWidgetName).toHaveBeenCalledWith("country");
  });

  it("shows reference hint when param name is set", () => {
    mockStoreState.paramWidgetName = "country";
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByTestId("param-reference-hint")).toBeInTheDocument();
    expect(screen.getByText("$param_country")).toBeInTheDocument();
  });

  it("does not show reference hint when param name is empty", () => {
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(
      screen.queryByTestId("param-reference-hint"),
    ).not.toBeInTheDocument();
  });

  it("shows multi-select toggle for select type", () => {
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByText("Allow multiple selections")).toBeInTheDocument();
  });

  it("hides multi-select toggle for non-select types", () => {
    mockStoreState.paramUIType = "date";
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(
      screen.queryByText("Allow multiple selections"),
    ).not.toBeInTheDocument();
  });

  it("shows date mode selector for date type", () => {
    mockStoreState.paramUIType = "date";
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByText("Date Mode")).toBeInTheDocument();
  });

  it("hides date mode selector for non-date types", () => {
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.queryByText("Date Mode")).not.toBeInTheDocument();
  });

  it("shows seed query section for select type", () => {
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByText("Seed Query")).toBeInTheDocument();
    expect(screen.getByText("Test Seed Query")).toBeInTheDocument();
  });

  it("hides seed query section for freetext type", () => {
    mockStoreState.paramUIType = "freetext";
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.queryByText("Seed Query")).not.toBeInTheDocument();
  });

  it("disables test seed query button when no connection", () => {
    mockStoreState.connectionId = "";
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByText("Test Seed Query")).toBeDisabled();
  });

  it("disables test seed query button when seed query empty", () => {
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByText("Test Seed Query")).toBeDisabled();
  });

  it("shows Running... when seed query is pending", () => {
    render(
      <ParameterConfigSection
        seedQueryExecution={{ ...baseSeedExecution, isPending: true }}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByText("Running...")).toBeInTheDocument();
  });

  it("shows error message on seed query error", () => {
    render(
      <ParameterConfigSection
        seedQueryExecution={{
          ...baseSeedExecution,
          isError: true,
          error: new Error("Connection failed"),
        }}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
  });

  it("shows options count when seed preview has results", () => {
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
          { value: "c", label: "C" },
        ]}
      />,
    );
    expect(screen.getByText(/3 options loaded/)).toBeInTheDocument();
  });

  it("shows singular for 1 option", () => {
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={[{ value: "a", label: "A" }]}
      />,
    );
    expect(screen.getByText(/1 option loaded/)).toBeInTheDocument();
  });

  it("shows date range sub-parameters in reference hint", () => {
    mockStoreState.paramUIType = "date";
    mockStoreState.dateSub = "range";
    mockStoreState.paramWidgetName = "period";
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByText("$param_period_from")).toBeInTheDocument();
    expect(screen.getByText("$param_period_to")).toBeInTheDocument();
  });

  // ── number-range editor (regression: #861) ────────────────────────
  it("shows range-bounds inputs for number-range type", () => {
    mockStoreState.paramUIType = "number-range";
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByLabelText("Range minimum")).toBeInTheDocument();
    expect(screen.getByLabelText("Range maximum")).toBeInTheDocument();
    expect(screen.getByLabelText("Range step")).toBeInTheDocument();
  });

  it("shows number-range sub-parameters in reference hint", () => {
    mockStoreState.paramUIType = "number-range";
    mockStoreState.paramWidgetName = "year";
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByText("$param_year_min")).toBeInTheDocument();
    expect(screen.getByText("$param_year_max")).toBeInTheDocument();
  });

  it("writes rangeMax into chartOptions when user changes max input", () => {
    mockStoreState.paramUIType = "number-range";
    mockStoreState.chartOptions = { rangeMin: 0, rangeMax: 100, rangeStep: 1 };
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    fireEvent.change(screen.getByLabelText("Range maximum"), {
      target: { value: "250" },
    });
    // Either a direct object or a functional updater is acceptable —
    // we only need to confirm chartOptions was updated for the max field.
    expect(mockSetChartOptions).toHaveBeenCalled();
  });

  it.each(["Range minimum", "Range maximum", "Range step"])(
    "ignores a cleared %s instead of committing 0 (#1292)",
    (label) => {
      mockStoreState.paramUIType = "number-range";
      mockStoreState.chartOptions = {
        rangeMin: 0,
        rangeMax: 100,
        rangeStep: 1,
      };
      render(
        <ParameterConfigSection
          seedQueryExecution={baseSeedExecution}
          seedPreviewOptions={null}
        />,
      );
      fireEvent.change(screen.getByLabelText(label), { target: { value: "" } });
      // Number("") is 0 — clearing the field used to write 0, which the
      // controlled input rendered straight back, so it could not be retyped.
      expect(mockSetChartOptions).not.toHaveBeenCalled();

      // The guard must not swallow real edits.
      fireEvent.change(screen.getByLabelText(label), {
        target: { value: "7" },
      });
      expect(mockSetChartOptions).toHaveBeenCalled();
    },
  );

  // ── cascading editor (regression: #861, reshaped by #1360) ─────────
  // Cascading is now a *configuration* of `select`: the parent input sits
  // in the select editor, so a user can turn any select into a cascade
  // without switching widget type.
  it("shows the parent-parameter input for the select type", () => {
    mockStoreState.paramUIType = "select";
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByLabelText(/Parent Parameter Name/)).toBeInTheDocument();
    // …alongside the seed query it has always had.
    expect(screen.getByText("Seed Query")).toBeInTheDocument();
  });

  it("hides the parent-parameter input for non-select types", () => {
    for (const t of ["date", "freetext", "number-range"] as const) {
      mockStoreState.paramUIType = t;
      const { unmount } = render(
        <ParameterConfigSection
          seedQueryExecution={baseSeedExecution}
          seedPreviewOptions={null}
        />,
      );
      expect(screen.queryByTestId("param-cascading-config")).toBeNull();
      unmount();
    }
  });

  it("hides seed query input for number-range type", () => {
    mockStoreState.paramUIType = "number-range";
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.queryByText("Seed Query")).not.toBeInTheDocument();
  });
});
