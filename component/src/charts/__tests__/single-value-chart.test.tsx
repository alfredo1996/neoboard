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
});
