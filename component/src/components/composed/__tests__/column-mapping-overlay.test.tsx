import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ColumnMappingOverlay } from "../column-mapping-overlay";
import type { ColumnMapping } from "../column-mapping-overlay";

const COLUMNS = ["name", "value", "category"];
const EMPTY_MAPPING: ColumnMapping = {};

describe("ColumnMappingOverlay", () => {
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
});
