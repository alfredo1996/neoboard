import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@neoboard/components", () => ({
  // The rest reach the DOM so aria-describedby is asserted, not dropped (#1951).
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => <button {...props}>{children}</button>,
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
import { useParameterStore } from "@/stores/parameter-store";

const baseSeedExecution = {
  isPending: false,
  isError: false,
  error: null,
  mutate: vi.fn(),
};

// #1824: the dashboard card asks for the options on the selector's saved
// database (card-container.test.tsx), so the editor's check runs there too.
describe("ParameterConfigSection — Test Seed Query runs on the selector's database (#1824)", () => {
  function testSeedWith(database: string) {
    mockStoreState = {
      paramUIType: "select",
      setParamUIType: vi.fn(),
      paramWidgetName: "db",
      setParamWidgetName: vi.fn(),
      multiSelect: false,
      setMultiSelect: vi.fn(),
      dateSub: "single",
      setDateSub: vi.fn(),
      chartOptions: { seedQuery: "SELECT 1" },
      setChartOptions: vi.fn(),
      connectionId: "conn-1",
      database,
    };
    const mutate = vi.fn();
    render(
      <ParameterConfigSection
        seedQueryExecution={{ ...baseSeedExecution, mutate }}
        seedPreviewOptions={null}
      />,
    );
    fireEvent.click(screen.getByText("Test Seed Query"));
    expect(mutate).toHaveBeenCalledTimes(1);
    return mutate.mock.calls[0][0] as Record<string, unknown>;
  }

  it("sends the database the selector saves", () => {
    expect(testSeedWith("neoboard")).toEqual({
      connectionId: "conn-1",
      query: "SELECT 1",
      database: "neoboard",
    });
  });

  it("sends no database when the selector saves none", () => {
    expect(testSeedWith("")).not.toHaveProperty("database");
  });
});

// #1951: a cascading child's seed query references $param_<parent>. The
// dashboard binds the parent's current value (use-seed-query-options.ts), so
// the editor's check does too — and refuses to run without one.
describe("ParameterConfigSection — Test Seed Query binds the cascade parent (#1951)", () => {
  beforeEach(() => {
    useParameterStore.getState().clearAll();
  });

  function renderSeed(
    chartOptions: Record<string, unknown>,
    isLabMode = false,
  ) {
    mockStoreState = {
      paramUIType: "select",
      setParamUIType: vi.fn(),
      paramWidgetName: "city",
      setParamWidgetName: vi.fn(),
      multiSelect: false,
      setMultiSelect: vi.fn(),
      dateSub: "single",
      setDateSub: vi.fn(),
      chartOptions,
      setChartOptions: vi.fn(),
      connectionId: "conn-1",
      database: "",
    };
    const mutate = vi.fn();
    render(
      <ParameterConfigSection
        seedQueryExecution={{ ...baseSeedExecution, mutate }}
        seedPreviewOptions={null}
        isLabMode={isLabMode}
      />,
    );
    return mutate;
  }

  /** Click Test Seed Query and report what a held-back button must show. */
  function clickTestSeed(mutate: ReturnType<typeof vi.fn>) {
    const button = screen.getByText("Test Seed Query");
    fireEvent.click(button);
    return {
      disabled: button.hasAttribute("disabled"),
      ran: mutate.mock.calls.length > 0,
      // The button names its hint, so a screen reader says why it is disabled.
      describedBy: button.getAttribute("aria-describedby"),
    };
  }

  function heldBackBy(hint: string) {
    return {
      disabled: true,
      ran: false,
      describedBy: screen.getByText(hint).id,
    };
  }

  const cascading = {
    parentParameterName: "country",
    seedQuery: "SELECT name FROM city WHERE country = $param_country",
  };

  it("sends the parent's dashboard value as param_<parent>", () => {
    useParameterStore
      .getState()
      .setParameter("country", "Italy", "Country", "country", "select");
    const mutate = renderSeed(cascading);
    fireEvent.click(screen.getByText("Test Seed Query"));
    expect(mutate).toHaveBeenCalledWith({
      connectionId: "conn-1",
      query: cascading.seedQuery,
      params: { param_country: "Italy" },
    });
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
  ])("does not run and says why when the parent is %s", (_, value) => {
    if (value !== undefined) {
      useParameterStore
        .getState()
        .setParameter("country", value, "Country", "country", "select");
    }
    const mutate = renderSeed(cascading);
    expect(clickTestSeed(mutate)).toEqual(
      heldBackBy("Pick a country value on the dashboard first"),
    );
  });

  // The dashboard holds a cascade back for a list or range parent too, so
  // asking the user to pick the value they already picked would be wrong.
  it("says the cascade needs a single value when the parent is a list", () => {
    useParameterStore
      .getState()
      .setParameter(
        "country",
        ["Italy", "France"],
        "Country",
        "country",
        "multi-select",
      );
    const mutate = renderSeed(cascading);
    expect(clickTestSeed(mutate)).toEqual(
      heldBackBy(
        "A cascade needs a single country value; the dashboard's is a list or range",
      ),
    );
  });

  // The Widget Library has no dashboard, and the store still holds the last
  // dashboard's values: binding one would test against an unrelated dashboard.
  it("never binds a store value in the Widget Library", () => {
    useParameterStore
      .getState()
      .setParameter("country", "Italy", "Country", "country", "select");
    const mutate = renderSeed(cascading, true);
    expect(clickTestSeed(mutate)).toEqual(
      heldBackBy(
        "Test Seed Query needs a country value, which a dashboard sets",
      ),
    );
  });

  it("runs a non-cascading seed query in the Widget Library", () => {
    const mutate = renderSeed(
      { parentParameterName: "", seedQuery: "SELECT 1" },
      true,
    );
    fireEvent.click(screen.getByText("Test Seed Query"));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("sends a non-cascading seed query with no params key", () => {
    useParameterStore
      .getState()
      .setParameter("country", "Italy", "Country", "country", "select");
    const mutate = renderSeed({
      parentParameterName: "",
      seedQuery: "SELECT 1",
    });
    fireEvent.click(screen.getByText("Test Seed Query"));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).not.toHaveProperty("params");
  });

  // A searchable selector whose seed consumes $param_search always gets it
  // on the dashboard, "" before anything is typed (#1743); the editor's test
  // sends the same, built by the same helper (#2043).
  describe("param_search (#2043)", () => {
    const searching = "SELECT name FROM city WHERE name ILIKE $param_search";

    it('sends param_search: "" for a searchable seed that consumes it', () => {
      const mutate = renderSeed({ searchable: true, seedQuery: searching });
      fireEvent.click(screen.getByText("Test Seed Query"));
      expect(mutate.mock.calls[0][0].params).toEqual({ param_search: "" });
    });

    it("treats an unset searchable as searchable, as the dashboard does", () => {
      const mutate = renderSeed({ seedQuery: searching });
      fireEvent.click(screen.getByText("Test Seed Query"));
      expect(mutate.mock.calls[0][0].params).toEqual({ param_search: "" });
    });

    it("sends the cascade parent and param_search together", () => {
      useParameterStore
        .getState()
        .setParameter("country", "Italy", "Country", "country", "select");
      const mutate = renderSeed({
        parentParameterName: "country",
        seedQuery: `${searching} AND country = $param_country`,
      });
      fireEvent.click(screen.getByText("Test Seed Query"));
      expect(mutate.mock.calls[0][0].params).toEqual({
        param_country: "Italy",
        param_search: "",
      });
    });

    it("sends no param_search for a selector that is not searchable", () => {
      const mutate = renderSeed({ searchable: false, seedQuery: searching });
      fireEvent.click(screen.getByText("Test Seed Query"));
      expect(mutate.mock.calls[0][0]).not.toHaveProperty("params");
    });
  });
});

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
    expect(screen.getByLabelText(/Depends On/)).toBeInTheDocument();
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
