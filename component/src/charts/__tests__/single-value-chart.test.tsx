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

  it("shows up trend with the success token color", () => {
    render(
      <SingleValueChart
        value={100}
        trend={{ direction: "up", label: "+12%" }}
      />,
    );
    const trend = screen.getByText(/\+12%/);
    expect(trend).toBeInTheDocument();
    // Token-based, not a raw Tailwind green — so it tracks the theme (#1059).
    expect(trend).toHaveClass("text-[hsl(var(--success))]");
  });

  it("shows down trend with the danger token color", () => {
    render(
      <SingleValueChart
        value={80}
        trend={{ direction: "down", label: "-5%" }}
      />,
    );
    const trend = screen.getByText(/-5%/);
    expect(trend).toBeInTheDocument();
    expect(trend).toHaveClass("text-[hsl(var(--danger))]");
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
    render(
      <SingleValueChart
        value={1000}
        format={(v) => `~${v}`}
        numberFormat="comma"
      />,
    );
    expect(screen.getByText("~1000")).toBeInTheDocument();
  });

  // --- Styling rules (replaced legacy colorThresholds) ---

  it("applies styling rule color when value matches", () => {
    const rules = [
      { id: "r1", operator: "<" as const, value: 50, color: "#ff0000" },
      { id: "r2", operator: ">=" as const, value: 50, color: "#00ff00" },
    ];
    const { container } = render(
      <SingleValueChart value={30} stylingRules={rules} />,
    );
    const valueEl = container.querySelector("[style]");
    expect(valueEl).toHaveStyle({ color: "rgb(255, 0, 0)" });
  });

  it("applies second styling rule when value exceeds first threshold", () => {
    const rules = [
      { id: "r1", operator: "<" as const, value: 50, color: "#ff0000" },
      { id: "r2", operator: ">=" as const, value: 50, color: "#00ff00" },
    ];
    const { container } = render(
      <SingleValueChart value={75} stylingRules={rules} />,
    );
    const valueEl = container.querySelector("[style]");
    expect(valueEl).toHaveStyle({ color: "rgb(0, 255, 0)" });
  });

  it("does not apply styling rule color for string values", () => {
    const rules = [
      { id: "r1", operator: "<" as const, value: 50, color: "red" },
    ];
    const { container } = render(
      <SingleValueChart value="N/A" stylingRules={rules} />,
    );
    expect(container.querySelector("[style]")).not.toBeInTheDocument();
  });

  // --- decimalPlaces ---

  it("formats value with decimalPlaces", () => {
    render(<SingleValueChart value={3.14159} decimalPlaces={2} />);
    expect(screen.getByText("3.14")).toBeInTheDocument();
  });

  it("pads with zeros when decimalPlaces exceeds precision", () => {
    render(<SingleValueChart value={5} decimalPlaces={2} />);
    expect(screen.getByText("5.00")).toBeInTheDocument();
  });

  it("combines decimalPlaces with numberFormat comma", () => {
    render(
      <SingleValueChart
        value={1234567.891}
        decimalPlaces={1}
        numberFormat="comma"
      />,
    );
    expect(screen.getByText("1,234,567.9")).toBeInTheDocument();
  });

  it("ignores decimalPlaces of -1 (automatic)", () => {
    render(<SingleValueChart value={3.14159} decimalPlaces={-1} />);
    expect(screen.getByText("3.14159")).toBeInTheDocument();
  });
});
