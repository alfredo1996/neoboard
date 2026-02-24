import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ColumnMappingOverlay } from "../column-mapping-overlay";
import type { ColumnMapping } from "../column-mapping-overlay";

const COLUMNS = ["name", "value", "category"];
const EMPTY_MAPPING: ColumnMapping = {};

describe("ColumnMappingOverlay", () => {
  // -------------------------------------------------------------------------
  // Render — empty columns guard
  // -------------------------------------------------------------------------

  it("renders nothing when availableColumns is empty", () => {
    const { container } = render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={[]}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Labels — bar
  // -------------------------------------------------------------------------

  it("renders X Axis and Y Axis labels for bar chart", () => {
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
      />
    );
    expect(screen.getByText("X Axis")).toBeInTheDocument();
    expect(screen.getByText("Y Axis")).toBeInTheDocument();
    expect(screen.getByText("Group By")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Labels — line
  // -------------------------------------------------------------------------

  it("renders X Axis and Y Axis labels for line chart", () => {
    render(
      <ColumnMappingOverlay
        chartType="line"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
      />
    );
    expect(screen.getByText("X Axis")).toBeInTheDocument();
    expect(screen.getByText("Y Axis")).toBeInTheDocument();
    expect(screen.getByText("Group By")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Labels — pie
  // -------------------------------------------------------------------------

  it("renders Name and Value labels for pie chart instead of X/Y Axis", () => {
    render(
      <ColumnMappingOverlay
        chartType="pie"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
      />
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
    // Group By should not appear for pie
    expect(screen.queryByText("Group By")).not.toBeInTheDocument();
  });

  it("does not render Group By dropdown for pie chart", () => {
    render(
      <ColumnMappingOverlay
        chartType="pie"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
      />
    );
    expect(
      screen.queryByTestId("column-mapping-groupby-trigger")
    ).not.toBeInTheDocument();
  });

  it("renders Group By dropdown for bar chart", () => {
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
      />
    );
    expect(
      screen.getByTestId("column-mapping-groupby-trigger")
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Triggers presence
  // -------------------------------------------------------------------------

  it("renders the overlay container with correct testid", () => {
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
      />
    );
    expect(
      screen.getByTestId("column-mapping-overlay")
    ).toBeInTheDocument();
  });

  it("applies a custom className", () => {
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
        className="my-custom-class"
      />
    );
    expect(
      screen.getByTestId("column-mapping-overlay")
    ).toHaveClass("my-custom-class");
  });

  it("renders three select triggers for bar chart", () => {
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
      />
    );
    expect(
      screen.getByTestId("column-mapping-x-trigger")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("column-mapping-y-trigger")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("column-mapping-groupby-trigger")
    ).toBeInTheDocument();
  });

  it("renders two select triggers for pie chart", () => {
    render(
      <ColumnMappingOverlay
        chartType="pie"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
      />
    );
    expect(
      screen.getByTestId("column-mapping-x-trigger")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("column-mapping-y-trigger")
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("column-mapping-groupby-trigger")
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Available columns displayed in dropdown
  // -------------------------------------------------------------------------

  it("shows all available columns when X Axis select is opened", () => {
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("column-mapping-x-trigger"));
    // All column names should appear as options (they may appear multiple times across
    // different open selects, so use getAllByText and check at least one exists)
    COLUMNS.forEach((col) => {
      expect(screen.getAllByText(col).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows all available columns when Y Axis select is opened", () => {
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("column-mapping-y-trigger"));
    COLUMNS.forEach((col) => {
      expect(screen.getAllByText(col).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows all available columns when Group By select is opened", () => {
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("column-mapping-groupby-trigger"));
    COLUMNS.forEach((col) => {
      expect(screen.getAllByText(col).length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Reflected mapping values
  // -------------------------------------------------------------------------

  it("reflects xAxis value from mapping in x trigger", () => {
    const mapping: ColumnMapping = { xAxis: "name" };
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={mapping}
        onMappingChange={vi.fn()}
      />
    );
    // The selected value "name" should be shown inside the trigger
    const xTrigger = screen.getByTestId("column-mapping-x-trigger");
    expect(xTrigger).toHaveTextContent("name");
  });

  it("reflects yAxis[0] value from mapping in y trigger", () => {
    const mapping: ColumnMapping = { yAxis: ["value"] };
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={mapping}
        onMappingChange={vi.fn()}
      />
    );
    const yTrigger = screen.getByTestId("column-mapping-y-trigger");
    expect(yTrigger).toHaveTextContent("value");
  });

  it("reflects groupBy value from mapping in groupby trigger", () => {
    const mapping: ColumnMapping = { groupBy: "category" };
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={mapping}
        onMappingChange={vi.fn()}
      />
    );
    const groupByTrigger = screen.getByTestId("column-mapping-groupby-trigger");
    expect(groupByTrigger).toHaveTextContent("category");
  });

  it("shows auto placeholder in x trigger when xAxis is undefined", () => {
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
      />
    );
    const xTrigger = screen.getByTestId("column-mapping-x-trigger");
    // The placeholder text "auto" should be present when no mapping is set
    expect(xTrigger).toHaveTextContent("auto");
  });

  it("shows auto placeholder in y trigger when yAxis is undefined", () => {
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
      />
    );
    const yTrigger = screen.getByTestId("column-mapping-y-trigger");
    expect(yTrigger).toHaveTextContent("auto");
  });

  // -------------------------------------------------------------------------
  // onMappingChange callbacks — via Select interaction
  // -------------------------------------------------------------------------

  it("calls onMappingChange with updated xAxis when a column is selected for X", () => {
    const onMappingChange = vi.fn();
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={onMappingChange}
      />
    );
    // Open the X select
    fireEvent.click(screen.getByTestId("column-mapping-x-trigger"));
    // Click the "name" option
    fireEvent.click(screen.getByRole("option", { name: "name" }));
    expect(onMappingChange).toHaveBeenCalledWith(
      expect.objectContaining({ xAxis: "name" })
    );
  });

  it("calls onMappingChange with xAxis undefined when auto is selected for X", () => {
    const onMappingChange = vi.fn();
    const mapping: ColumnMapping = { xAxis: "name" };
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={mapping}
        onMappingChange={onMappingChange}
      />
    );
    fireEvent.click(screen.getByTestId("column-mapping-x-trigger"));
    fireEvent.click(screen.getByRole("option", { name: "auto" }));
    expect(onMappingChange).toHaveBeenCalledWith(
      expect.objectContaining({ xAxis: undefined })
    );
  });

  it("calls onMappingChange with updated yAxis when a column is selected for Y", () => {
    const onMappingChange = vi.fn();
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={onMappingChange}
      />
    );
    fireEvent.click(screen.getByTestId("column-mapping-y-trigger"));
    fireEvent.click(screen.getByRole("option", { name: "value" }));
    expect(onMappingChange).toHaveBeenCalledWith(
      expect.objectContaining({ yAxis: ["value"] })
    );
  });

  it("calls onMappingChange with empty yAxis when auto is selected for Y", () => {
    const onMappingChange = vi.fn();
    const mapping: ColumnMapping = { yAxis: ["value"] };
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={mapping}
        onMappingChange={onMappingChange}
      />
    );
    fireEvent.click(screen.getByTestId("column-mapping-y-trigger"));
    fireEvent.click(screen.getByRole("option", { name: "auto" }));
    expect(onMappingChange).toHaveBeenCalledWith(
      expect.objectContaining({ yAxis: [] })
    );
  });

  it("calls onMappingChange with updated groupBy when a column is selected", () => {
    const onMappingChange = vi.fn();
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={onMappingChange}
      />
    );
    fireEvent.click(screen.getByTestId("column-mapping-groupby-trigger"));
    fireEvent.click(screen.getByRole("option", { name: "category" }));
    expect(onMappingChange).toHaveBeenCalledWith(
      expect.objectContaining({ groupBy: "category" })
    );
  });

  it("calls onMappingChange with groupBy undefined when none is selected", () => {
    const onMappingChange = vi.fn();
    const mapping: ColumnMapping = { groupBy: "category" };
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={mapping}
        onMappingChange={onMappingChange}
      />
    );
    fireEvent.click(screen.getByTestId("column-mapping-groupby-trigger"));
    fireEvent.click(screen.getByRole("option", { name: "none" }));
    expect(onMappingChange).toHaveBeenCalledWith(
      expect.objectContaining({ groupBy: undefined })
    );
  });

  // -------------------------------------------------------------------------
  // Pie chart — X (Name) and Y (Value) interact correctly
  // -------------------------------------------------------------------------

  it("calls onMappingChange with updated xAxis for pie Name select", () => {
    const onMappingChange = vi.fn();
    render(
      <ColumnMappingOverlay
        chartType="pie"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={onMappingChange}
      />
    );
    fireEvent.click(screen.getByTestId("column-mapping-x-trigger"));
    fireEvent.click(screen.getByRole("option", { name: "category" }));
    expect(onMappingChange).toHaveBeenCalledWith(
      expect.objectContaining({ xAxis: "category" })
    );
  });

  it("calls onMappingChange with updated yAxis for pie Value select", () => {
    const onMappingChange = vi.fn();
    render(
      <ColumnMappingOverlay
        chartType="pie"
        availableColumns={COLUMNS}
        mapping={EMPTY_MAPPING}
        onMappingChange={onMappingChange}
      />
    );
    fireEvent.click(screen.getByTestId("column-mapping-y-trigger"));
    fireEvent.click(screen.getByRole("option", { name: "value" }));
    expect(onMappingChange).toHaveBeenCalledWith(
      expect.objectContaining({ yAxis: ["value"] })
    );
  });

  // -------------------------------------------------------------------------
  // Single column in availableColumns
  // -------------------------------------------------------------------------

  it("renders correctly with a single available column", () => {
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={["onlyCol"]}
        mapping={EMPTY_MAPPING}
        onMappingChange={vi.fn()}
      />
    );
    expect(screen.getByTestId("column-mapping-overlay")).toBeInTheDocument();
    // The single column should be visible in all select dropdowns
    fireEvent.click(screen.getByTestId("column-mapping-x-trigger"));
    expect(screen.getAllByText("onlyCol").length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Mapping preserves existing fields when partial update is made
  // -------------------------------------------------------------------------

  it("preserves existing mapping fields when xAxis changes", () => {
    const onMappingChange = vi.fn();
    const existingMapping: ColumnMapping = { yAxis: ["value"], groupBy: "category" };
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={existingMapping}
        onMappingChange={onMappingChange}
      />
    );
    fireEvent.click(screen.getByTestId("column-mapping-x-trigger"));
    fireEvent.click(screen.getByRole("option", { name: "name" }));
    const called = onMappingChange.mock.calls[0][0] as ColumnMapping;
    expect(called.xAxis).toBe("name");
    expect(called.yAxis).toEqual(["value"]);
    expect(called.groupBy).toBe("category");
  });

  it("preserves existing mapping fields when yAxis changes", () => {
    const onMappingChange = vi.fn();
    const existingMapping: ColumnMapping = { xAxis: "name", groupBy: "category" };
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={existingMapping}
        onMappingChange={onMappingChange}
      />
    );
    fireEvent.click(screen.getByTestId("column-mapping-y-trigger"));
    fireEvent.click(screen.getByRole("option", { name: "value" }));
    const called = onMappingChange.mock.calls[0][0] as ColumnMapping;
    expect(called.xAxis).toBe("name");
    expect(called.yAxis).toEqual(["value"]);
    expect(called.groupBy).toBe("category");
  });

  it("preserves existing mapping fields when groupBy changes", () => {
    const onMappingChange = vi.fn();
    const existingMapping: ColumnMapping = { xAxis: "name", yAxis: ["value"] };
    render(
      <ColumnMappingOverlay
        chartType="bar"
        availableColumns={COLUMNS}
        mapping={existingMapping}
        onMappingChange={onMappingChange}
      />
    );
    fireEvent.click(screen.getByTestId("column-mapping-groupby-trigger"));
    fireEvent.click(screen.getByRole("option", { name: "category" }));
    const called = onMappingChange.mock.calls[0][0] as ColumnMapping;
    expect(called.xAxis).toBe("name");
    expect(called.yAxis).toEqual(["value"]);
    expect(called.groupBy).toBe("category");
  });
});
