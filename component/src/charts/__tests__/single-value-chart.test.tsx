import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SingleValueChart } from "../single-value-chart";

describe("SingleValueChart", () => {
  it("renders value", () => {
    render(<SingleValueChart value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders title", () => {
    render(<SingleValueChart value={42} title="Users Online" />);
    expect(screen.getByText("Users Online")).toBeInTheDocument();
  });

  it("renders prefix and suffix", () => {
    render(<SingleValueChart value={99} prefix="$" suffix="M" />);
    expect(screen.getByText(/\$99M/)).toBeInTheDocument();
  });

  it("formats numeric values", () => {
    const fmt = (v: number) => v.toLocaleString("en-US");
    render(<SingleValueChart value={1234567} format={fmt} />);
    expect(screen.getByText("1,234,567")).toBeInTheDocument();
  });

  it("shows up trend", () => {
    render(
      <SingleValueChart value={100} trend={{ direction: "up", label: "+12%" }} />,
    );
    expect(screen.getByText(/\+12%/)).toBeInTheDocument();
  });

  it("shows down trend", () => {
    render(
      <SingleValueChart value={80} trend={{ direction: "down", label: "-5%" }} />,
    );
    expect(screen.getByText(/-5%/)).toBeInTheDocument();
  });

  it("shows loading state", () => {
    const { container } = render(<SingleValueChart value={0} loading />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<SingleValueChart value={0} error={new Error("No data")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No data");
  });

  it("applies custom className", () => {
    render(<SingleValueChart value={42} className="custom" />);
    expect(screen.getByTestId("single-value-chart")).toHaveClass("custom");
  });

  // --- New options: fontSize ---

  it("applies text-xl class for fontSize sm", () => {
    const { container } = render(<SingleValueChart value={42} fontSize="sm" />);
    const valueEl = container.querySelector(".text-xl");
    expect(valueEl).toBeInTheDocument();
  });

  it("applies text-3xl class for fontSize lg (default)", () => {
    const { container } = render(<SingleValueChart value={42} />);
    const valueEl = container.querySelector(".text-3xl");
    expect(valueEl).toBeInTheDocument();
  });

  it("applies text-5xl class for fontSize xl", () => {
    const { container } = render(<SingleValueChart value={42} fontSize="xl" />);
    const valueEl = container.querySelector(".text-5xl");
    expect(valueEl).toBeInTheDocument();
  });

  // --- New options: numberFormat ---

  it("formats number with comma when numberFormat is comma", () => {
    render(<SingleValueChart value={1234567} numberFormat="comma" />);
    expect(screen.getByText("1,234,567")).toBeInTheDocument();
  });

  it("formats number as compact when numberFormat is compact", () => {
    render(<SingleValueChart value={1500000} numberFormat="compact" />);
    // Intl compact format for 1.5M
    expect(screen.getByText(/1\.5M/i)).toBeInTheDocument();
  });

  it("appends percent sign when numberFormat is percent", () => {
    render(<SingleValueChart value={75} numberFormat="percent" />);
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("uses plain display when numberFormat is plain (default)", () => {
    render(<SingleValueChart value={1234} />);
    expect(screen.getByText("1234")).toBeInTheDocument();
  });

  it("format prop takes precedence over numberFormat", () => {
    render(<SingleValueChart value={1000} format={(v) => `~${v}`} numberFormat="comma" />);
    expect(screen.getByText("~1000")).toBeInTheDocument();
  });

  // --- New options: colorThresholds ---

  it("applies threshold color when value is below threshold", () => {
    const thresholds = JSON.stringify([{ value: 50, color: "#ff0000" }, { value: 100, color: "#00ff00" }]);
    const { container } = render(<SingleValueChart value={30} colorThresholds={thresholds} />);
    const valueEl = container.querySelector("[style]");
    expect(valueEl).toHaveStyle({ color: "rgb(255, 0, 0)" });
  });

  it("applies next threshold color when value exceeds first threshold", () => {
    const thresholds = JSON.stringify([{ value: 50, color: "#ff0000" }, { value: 100, color: "#00ff00" }]);
    const { container } = render(<SingleValueChart value={75} colorThresholds={thresholds} />);
    const valueEl = container.querySelector("[style]");
    expect(valueEl).toHaveStyle({ color: "rgb(0, 255, 0)" });
  });

  it("does not apply threshold color for string values", () => {
    const thresholds = JSON.stringify([{ value: 50, color: "red" }]);
    const { container } = render(<SingleValueChart value="N/A" colorThresholds={thresholds} />);
    expect(container.querySelector("[style]")).not.toBeInTheDocument();
  });

  it("handles invalid JSON in colorThresholds gracefully", () => {
    expect(() =>
      render(<SingleValueChart value={10} colorThresholds="not-json" />),
    ).not.toThrow();
  });
});
