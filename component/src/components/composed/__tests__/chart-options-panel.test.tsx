import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChartOptionsPanel } from "../chart-options-panel";

describe("ChartOptionsPanel", () => {
  it("renders options for bar chart", () => {
    render(
      <ChartOptionsPanel chartType="bar" settings={{}} onSettingsChange={vi.fn()} />
    );
    expect(screen.getByText("Orientation")).toBeInTheDocument();
    expect(screen.getByText("Stacked")).toBeInTheDocument();
    expect(screen.getByText("Show Values")).toBeInTheDocument();
    expect(screen.getByText("Show Legend")).toBeInTheDocument();
    expect(screen.getByText("Bar Width (px, 0=auto)")).toBeInTheDocument();
    expect(screen.getByText("Show Grid Lines")).toBeInTheDocument();
  });

  it("shows empty message for unknown chart type", () => {
    render(
      <ChartOptionsPanel chartType="unknown" settings={{}} onSettingsChange={vi.fn()} />
    );
    expect(screen.getByText(/no configurable options/i)).toBeInTheDocument();
  });

  it("calls onSettingsChange when a boolean switch is toggled", () => {
    const onChange = vi.fn();
    render(
      <ChartOptionsPanel chartType="bar" settings={{ stacked: false }} onSettingsChange={onChange} />
    );
    const switchEl = screen.getByRole("switch", { name: "Stacked" });
    fireEvent.click(switchEl);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ stacked: true }));
  });

  it("calls onSettingsChange when a text input changes", () => {
    const onChange = vi.fn();
    render(
      <ChartOptionsPanel chartType="line" settings={{}} onSettingsChange={onChange} />
    );
    const input = screen.getByLabelText("X-Axis Label");
    fireEvent.change(input, { target: { value: "Time" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ xAxisLabel: "Time" }));
  });

  it("calls onSettingsChange when a number input changes", () => {
    const onChange = vi.fn();
    render(
      <ChartOptionsPanel chartType="table" settings={{}} onSettingsChange={onChange} />
    );
    const input = screen.getByLabelText("Page Size");
    fireEvent.change(input, { target: { value: "50" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 50 }));
  });

  it("groups options by category", () => {
    render(
      <ChartOptionsPanel chartType="bar" settings={{}} onSettingsChange={vi.fn()} />
    );
    expect(screen.getByText("Layout")).toBeInTheDocument();
    expect(screen.getByText("Labels")).toBeInTheDocument();
  });

  it("shows search input for chart types with many options", () => {
    render(
      <ChartOptionsPanel chartType="map" settings={{}} onSettingsChange={vi.fn()} />
    );
    expect(screen.getByPlaceholderText("Search options...")).toBeInTheDocument();
  });

  it("does not show search input for chart types with few options", () => {
    // json has only 1 option, well below the threshold of 4
    render(
      <ChartOptionsPanel chartType="json" settings={{}} onSettingsChange={vi.fn()} />
    );
    expect(screen.queryByPlaceholderText("Search options...")).not.toBeInTheDocument();
  });

  it("filters options when searching", () => {
    render(
      <ChartOptionsPanel chartType="map" settings={{}} onSettingsChange={vi.fn()} />
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
      <ChartOptionsPanel chartType="parameter-select" settings={{}} onSettingsChange={vi.fn()} />
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
      />
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("applies cursor-help class to label when option has a description", () => {
    // All bar chart options have descriptions — labels should have cursor-help class
    const { container } = render(
      <ChartOptionsPanel chartType="bar" settings={{}} onSettingsChange={vi.fn()} />
    );
    const helpLabels = container.querySelectorAll("label.cursor-help");
    // bar has 9 options, all with descriptions
    expect(helpLabels.length).toBeGreaterThan(0);
    expect(helpLabels.length).toBe(9);
  });

  it("does not render a HelpCircle icon — tooltip triggers on label text", () => {
    // The HelpCircle icon was removed; only the label itself triggers the tooltip
    const { container } = render(
      <ChartOptionsPanel chartType="bar" settings={{}} onSettingsChange={vi.fn()} />
    );
    // There should be no svg element with the lucide HelpCircle path inside the panel
    const svgIcons = container.querySelectorAll("svg");
    // Only Switch thumbs and other UI icons, no HelpCircle — check no icon has cursor-help
    const helpIcons = container.querySelectorAll("svg.cursor-help");
    expect(helpIcons.length).toBe(0);
  });

  it("label has dotted underline decoration when description is set", () => {
    const { container } = render(
      <ChartOptionsPanel chartType="bar" settings={{}} onSettingsChange={vi.fn()} />
    );
    const helpLabels = container.querySelectorAll("label.cursor-help");
    expect(helpLabels.length).toBeGreaterThan(0);
    // All such labels should have the dotted underline class
    helpLabels.forEach((label) => {
      expect(label.classList.contains("decoration-dotted")).toBe(true);
    });
  });
});
