import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { ChartOptionsPanel } from "../chart-options-panel";
import { getChartOptions } from "../chart-options-schema";

// cmdk calls scrollIntoView which jsdom doesn't implement
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

/** Expand all collapsed category sections so their content is in the DOM. */
function expandAllCategories() {
  screen
    .getAllByRole("button", { expanded: false })
    .forEach((btn) => fireEvent.click(btn));
}

describe("ChartOptionsPanel", () => {
  it("renders options for bar chart", () => {
    render(
      <ChartOptionsPanel
        chartType="bar"
        settings={{}}
        onSettingsChange={vi.fn()}
      />,
    );
    expandAllCategories();
    expect(screen.getByText("Orientation")).toBeInTheDocument();
    expect(screen.getByText("Stack Mode")).toBeInTheDocument();
    expect(screen.getByText("Show Values")).toBeInTheDocument();
    expect(screen.getByText("Show Legend")).toBeInTheDocument();
    expect(screen.getByText("Bar Width (px, 0=auto)")).toBeInTheDocument();
    expect(screen.getByText("Show Grid Lines")).toBeInTheDocument();
  }, 15000);

  it("shows empty message for unknown chart type", () => {
    render(
      <ChartOptionsPanel
        chartType="unknown"
        settings={{}}
        onSettingsChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/no configurable options/i)).toBeInTheDocument();
  });

  it("calls onSettingsChange when a boolean switch is toggled", () => {
    const onChange = vi.fn();
    render(
      <ChartOptionsPanel
        chartType="bar"
        settings={{ showValues: false }}
        onSettingsChange={onChange}
      />,
    );
    expandAllCategories();
    const switchEl = screen.getByRole("switch", { name: "Show Values" });
    fireEvent.click(switchEl);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ showValues: true }),
    );
  });

  it("calls onSettingsChange when a text input changes", () => {
    const onChange = vi.fn();
    render(
      <ChartOptionsPanel
        chartType="line"
        settings={{}}
        onSettingsChange={onChange}
      />,
    );
    expandAllCategories();
    const input = screen.getByLabelText("X-Axis Label");
    fireEvent.change(input, { target: { value: "Time" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ xAxisLabel: "Time" }),
    );
  });

  it("calls onSettingsChange when a number input changes", () => {
    const onChange = vi.fn();
    render(
      <ChartOptionsPanel
        chartType="table"
        settings={{}}
        onSettingsChange={onChange}
      />,
    );
    expandAllCategories();
    const input = screen.getByLabelText("Page Size");
    fireEvent.change(input, { target: { value: "50" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 50 }),
    );
  });

  it("groups options by category", () => {
    render(
      <ChartOptionsPanel
        chartType="bar"
        settings={{}}
        onSettingsChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Layout")).toBeInTheDocument();
    expect(screen.getByText("Labels")).toBeInTheDocument();
  });

  it("shows search input for chart types with many options", () => {
    render(
      <ChartOptionsPanel
        chartType="map"
        settings={{}}
        onSettingsChange={vi.fn()}
      />,
    );
    expect(
      screen.getByPlaceholderText("Search options..."),
    ).toBeInTheDocument();
  });

  it("does not show search input for chart types with few options", () => {
    // parameter-select has only 2 options (no behavior options), below the threshold of 4
    render(
      <ChartOptionsPanel
        chartType="parameter-select"
        settings={{}}
        onSettingsChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByPlaceholderText("Search options..."),
    ).not.toBeInTheDocument();
  });

  it("filters options when searching", () => {
    render(
      <ChartOptionsPanel
        chartType="map"
        settings={{}}
        onSettingsChange={vi.fn()}
      />,
    );
    const searchInput = screen.getByPlaceholderText("Search options...");
    fireEvent.change(searchInput, { target: { value: "zoom" } });
    expect(screen.getByText("Default Zoom")).toBeInTheDocument();
    expect(screen.getByText("Min Zoom")).toBeInTheDocument();
    expect(screen.getByText("Max Zoom")).toBeInTheDocument();
    expect(screen.queryByText("Tile Layer")).not.toBeInTheDocument();
  });

  it("renders only placeholder and searchable for parameter-select", () => {
    render(
      <ChartOptionsPanel
        chartType="parameter-select"
        settings={{}}
        onSettingsChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Placeholder")).toBeInTheDocument();
    expect(screen.getByText("Search-as-you-type")).toBeInTheDocument();
    // Should NOT show the old primary fields
    expect(screen.queryByText("Parameter Name")).not.toBeInTheDocument();
    expect(screen.queryByText("Selector Type")).not.toBeInTheDocument();
  });

  it("applies className", () => {
    const { container } = render(
      <ChartOptionsPanel
        chartType="bar"
        settings={{}}
        onSettingsChange={vi.fn()}
        className="custom-class"
      />,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("applies cursor-help class to label when option has a description", () => {
    // All bar chart options have descriptions — labels should have cursor-help class
    const { container } = render(
      <ChartOptionsPanel
        chartType="bar"
        settings={{}}
        onSettingsChange={vi.fn()}
      />,
    );
    expandAllCategories();
    const helpLabels = container.querySelectorAll("label.cursor-help");
    // All bar options have descriptions — count should match schema
    expect(helpLabels.length).toBeGreaterThan(0);
    expect(helpLabels.length).toBe(getChartOptions("bar").length);
  });

  it("does not render a HelpCircle icon — tooltip triggers on label text", () => {
    // The HelpCircle icon was removed; only the label itself triggers the tooltip
    const { container } = render(
      <ChartOptionsPanel
        chartType="bar"
        settings={{}}
        onSettingsChange={vi.fn()}
      />,
    );
    expandAllCategories();
    // There should be no svg element with the lucide HelpCircle path inside the panel
    // Only Switch thumbs and other UI icons, no HelpCircle — check no icon has cursor-help
    const helpIcons = container.querySelectorAll("svg.cursor-help");
    expect(helpIcons.length).toBe(0);
  });

  it("label has dotted underline decoration when description is set", () => {
    const { container } = render(
      <ChartOptionsPanel
        chartType="bar"
        settings={{}}
        onSettingsChange={vi.fn()}
      />,
    );
    expandAllCategories();
    const helpLabels = container.querySelectorAll("label.cursor-help");
    expect(helpLabels.length).toBeGreaterThan(0);
    // All such labels should have the dotted underline class
    helpLabels.forEach((label) => {
      expect(label.classList.contains("decoration-dotted")).toBe(true);
    });
  });

  it("renders MultiSelect for column-multi-select type when columns are provided", () => {
    render(
      <ChartOptionsPanel
        chartType="table"
        settings={{ enableGrouping: true }}
        onSettingsChange={vi.fn()}
        columns={["country", "city", "population"]}
      />,
    );
    expandAllCategories();
    // MultiSelect renders a combobox trigger with placeholder text
    expect(screen.getByText("Select columns…")).toBeInTheDocument();
  });

  it("renders text fallback for column-multi-select when no columns are provided", () => {
    render(
      <ChartOptionsPanel
        chartType="table"
        settings={{ enableGrouping: true }}
        onSettingsChange={vi.fn()}
      />,
    );
    expandAllCategories();
    // Falls back to a text input when columns are not available
    const input = screen.getByPlaceholderText(
      "Run a preview query to select columns",
    );
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("calls onSettingsChange with comma-separated string when multi-select changes", () => {
    const onChange = vi.fn();
    render(
      <ChartOptionsPanel
        chartType="table"
        settings={{ enableGrouping: true, groupBy: "" }}
        onSettingsChange={onChange}
        columns={["country", "city", "population"]}
      />,
    );
    expandAllCategories();
    // MultiSelect trigger shows placeholder when nothing selected
    const trigger = screen.getByText("Select columns…").closest("button")!;
    fireEvent.click(trigger);
    // Select "city"
    const cityOption = screen.getByRole("option", { name: "city" });
    fireEvent.click(cityOption);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ groupBy: "city" }),
    );
  });
});
