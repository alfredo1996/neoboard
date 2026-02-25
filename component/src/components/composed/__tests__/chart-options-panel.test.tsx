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
});
