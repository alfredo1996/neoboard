import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChartTypePicker } from "../chart-type-picker";

describe("ChartTypePicker", () => {
  it("renders default chart type options", () => {
    render(<ChartTypePicker />);
    expect(screen.getByText("Bar")).toBeInTheDocument();
    expect(screen.getByText("Line")).toBeInTheDocument();
    expect(screen.getByText("Pie")).toBeInTheDocument();
  });

  it("renders custom options", () => {
    const options = [
      { type: "scatter", label: "Scatter", description: "Points" },
      { type: "area", label: "Area", description: "Filled" },
    ];
    render(<ChartTypePicker options={options} />);
    expect(screen.getByText("Scatter")).toBeInTheDocument();
    expect(screen.getByText("Area")).toBeInTheDocument();
  });

  it("highlights selected type", () => {
    const { container } = render(<ChartTypePicker value="bar" />);
    const selectedButton = container.querySelector(".border-primary");
    expect(selectedButton).toBeInTheDocument();
  });

  it("calls onValueChange when option clicked", () => {
    const onChange = vi.fn();
    render(<ChartTypePicker onValueChange={onChange} />);
    fireEvent.click(screen.getByText("Line"));
    expect(onChange).toHaveBeenCalledWith("line");
  });

  it("renders descriptions", () => {
    render(<ChartTypePicker />);
    expect(screen.getByText("Compare categories")).toBeInTheDocument();
    expect(screen.getByText("Show trends")).toBeInTheDocument();
  });

  it("exposes radiogroup semantics with the selected option checked", () => {
    render(<ChartTypePicker value="line" />);
    expect(
      screen.getByRole("radiogroup", { name: "Chart type" }),
    ).toBeInTheDocument();
    const line = screen.getByRole("radio", { name: /Line/ });
    expect(line).toHaveAttribute("aria-checked", "true");
    // Roving tabindex: the checked radio is the single tab stop.
    expect(line).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /Bar/ })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("moves selection with arrow keys (roving radiogroup)", () => {
    const onChange = vi.fn();
    render(<ChartTypePicker value="bar" onValueChange={onChange} />);
    const bar = screen.getByRole("radio", { name: /Bar/ });
    bar.focus();
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("line");
    onChange.mockClear();
    // Wraps from the first option backwards to the last.
    fireEvent.keyDown(bar, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("parameter-select");
  });
});
