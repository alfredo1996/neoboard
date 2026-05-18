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
    type,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement>) => {
    // Use defaultValue + key so React treats the input as uncontrolled.
    // React's value-tracker swallows fireEvent.change updates when `value`
    // is set numerically (or as a different "controlled" shape), making
    // it impossible to assert fractional-coercion logic. Uncontrolled mode
    // bypasses the tracker — onChange fires with the test's chosen value.
    const safeType = type === "number" ? "text" : type;
    return (
      <input
        id={id}
        key={String(value)}
        defaultValue={value as string | number | readonly string[] | undefined}
        onChange={onChange}
        data-testid={id}
        type={safeType}
        {...props}
      />
    );
  },
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

  it("shows min/max/step inputs for number-range type", () => {
    mockStoreState.paramUIType = "number-range";
    mockStoreState.chartOptions = { rangeMin: 0, rangeMax: 50, rangeStep: 5 };
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByTestId("param-number-range-config")).toBeInTheDocument();
    expect(screen.getByTestId("param-range-min")).toHaveValue("0");
    expect(screen.getByTestId("param-range-max")).toHaveValue("50");
    expect(screen.getByTestId("param-range-step")).toHaveValue("5");
  });

  it("hides number-range config for non-number-range types", () => {
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(
      screen.queryByTestId("param-number-range-config"),
    ).not.toBeInTheDocument();
  });

  it("hides seed query section for number-range type", () => {
    mockStoreState.paramUIType = "number-range";
    mockStoreState.chartOptions = {};
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.queryByText("Seed Query")).not.toBeInTheDocument();
  });

  it("renders all three range inputs (min, max, step) for number-range", () => {
    mockStoreState.paramUIType = "number-range";
    mockStoreState.chartOptions = { rangeMin: 0, rangeMax: 100, rangeStep: 1 };
    render(
      <ParameterConfigSection
        seedQueryExecution={baseSeedExecution}
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByTestId("param-range-min")).toBeInTheDocument();
    expect(screen.getByTestId("param-range-max")).toBeInTheDocument();
    expect(screen.getByTestId("param-range-step")).toBeInTheDocument();
  });

  // ── rangeNumberType + integer/float coercion ────────────────────
  describe("number-range integer/float", () => {
    function setupNumberRange(chartOptions: Record<string, unknown> = {}) {
      mockStoreState.paramUIType = "number-range";
      mockStoreState.chartOptions = chartOptions;
    }

    it("defaults rangeNumberType to integer when unset", () => {
      setupNumberRange({});
      render(
        <ParameterConfigSection
          seedQueryExecution={baseSeedExecution}
          seedPreviewOptions={null}
        />,
      );
      // Number Type select is rendered with default "integer"
      const trigger = screen.getByText("Number Type");
      expect(trigger).toBeInTheDocument();
    });

    it("switching to float bumps default step (1) to 0.1", () => {
      setupNumberRange({ rangeStep: 1 });
      render(
        <ParameterConfigSection
          seedQueryExecution={baseSeedExecution}
          seedPreviewOptions={null}
        />,
      );
      // The Number Type select is the 2nd <select> (1st is Parameter Type)
      const selects = screen.getAllByRole("combobox");
      const numberTypeSelect = selects[selects.length - 1];
      fireEvent.change(numberTypeSelect, { target: { value: "float" } });
      expect(mockSetChartOptions).toHaveBeenCalled();
      const updater = mockSetChartOptions.mock.calls[0][0] as (
        prev: Record<string, unknown>,
      ) => Record<string, unknown>;
      const next = updater({ rangeStep: 1 });
      expect(next.rangeNumberType).toBe("float");
      expect(next.rangeStep).toBe(0.1);
    });

    it("switching to integer snaps a fractional step up to >=1 whole", () => {
      setupNumberRange({ rangeNumberType: "float", rangeStep: 0.25 });
      render(
        <ParameterConfigSection
          seedQueryExecution={baseSeedExecution}
          seedPreviewOptions={null}
        />,
      );
      const selects = screen.getAllByRole("combobox");
      const numberTypeSelect = selects[selects.length - 1];
      fireEvent.change(numberTypeSelect, { target: { value: "integer" } });
      const updater = mockSetChartOptions.mock.calls[0][0] as (
        prev: Record<string, unknown>,
      ) => Record<string, unknown>;
      const next = updater({ rangeNumberType: "float", rangeStep: 0.25 });
      expect(next.rangeNumberType).toBe("integer");
      // 0.25 → round → 0 → max(1, 0) → 1
      expect(next.rangeStep).toBe(1);
    });

    it("min input rounds when type is integer", () => {
      setupNumberRange({ rangeNumberType: "integer", rangeMin: 0 });
      render(
        <ParameterConfigSection
          seedQueryExecution={baseSeedExecution}
          seedPreviewOptions={null}
        />,
      );
      fireEvent.change(screen.getByTestId("param-range-min"), {
        target: { value: "2.7" },
      });
      const updater = mockSetChartOptions.mock.calls[0][0] as (
        prev: Record<string, unknown>,
      ) => Record<string, unknown>;
      const next = updater({ rangeNumberType: "integer" });
      expect(next.rangeMin).toBe(3);
    });

    it("min input preserves decimals when type is float", () => {
      setupNumberRange({ rangeNumberType: "float", rangeMin: 0 });
      render(
        <ParameterConfigSection
          seedQueryExecution={baseSeedExecution}
          seedPreviewOptions={null}
        />,
      );
      fireEvent.change(screen.getByTestId("param-range-min"), {
        target: { value: "2.7" },
      });
      const updater = mockSetChartOptions.mock.calls[0][0] as (
        prev: Record<string, unknown>,
      ) => Record<string, unknown>;
      const next = updater({ rangeNumberType: "float" });
      expect(next.rangeMin).toBe(2.7);
    });

    it("max input rounds when type is integer", () => {
      setupNumberRange({ rangeNumberType: "integer", rangeMax: 100 });
      render(
        <ParameterConfigSection
          seedQueryExecution={baseSeedExecution}
          seedPreviewOptions={null}
        />,
      );
      fireEvent.change(screen.getByTestId("param-range-max"), {
        target: { value: "9.4" },
      });
      const updater = mockSetChartOptions.mock.calls[0][0] as (
        prev: Record<string, unknown>,
      ) => Record<string, unknown>;
      const next = updater({ rangeNumberType: "integer" });
      expect(next.rangeMax).toBe(9);
    });

    it("step input rounds and floors at 1 when type is integer", () => {
      setupNumberRange({ rangeNumberType: "integer", rangeStep: 1 });
      render(
        <ParameterConfigSection
          seedQueryExecution={baseSeedExecution}
          seedPreviewOptions={null}
        />,
      );
      fireEvent.change(screen.getByTestId("param-range-step"), {
        target: { value: "0.3" },
      });
      const updater = mockSetChartOptions.mock.calls[0][0] as (
        prev: Record<string, unknown>,
      ) => Record<string, unknown>;
      const next = updater({ rangeNumberType: "integer" });
      // 0.3 → round → 0 → max(1, 0) → 1
      expect(next.rangeStep).toBe(1);
    });

    it("step input preserves decimals when type is float", () => {
      setupNumberRange({ rangeNumberType: "float", rangeStep: 0.1 });
      render(
        <ParameterConfigSection
          seedQueryExecution={baseSeedExecution}
          seedPreviewOptions={null}
        />,
      );
      fireEvent.change(screen.getByTestId("param-range-step"), {
        target: { value: "0.05" },
      });
      const updater = mockSetChartOptions.mock.calls[0][0] as (
        prev: Record<string, unknown>,
      ) => Record<string, unknown>;
      const next = updater({ rangeNumberType: "float" });
      expect(next.rangeStep).toBe(0.05);
    });
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
});
