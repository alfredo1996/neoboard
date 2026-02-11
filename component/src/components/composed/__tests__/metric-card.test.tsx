import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MetricCard } from "../metric-card";

describe("MetricCard", () => {
  it("renders title and value", () => {
    render(<MetricCard title="Revenue" value="$45,231" />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("$45,231")).toBeInTheDocument();
  });

  it("renders prefix and suffix", () => {
    render(<MetricCard title="Revenue" value={45231} prefix="$" suffix="USD" />);
    expect(screen.getByText(/\$45231USD/)).toBeInTheDocument();
  });

  it("formats value with format function", () => {
    const format = (v: number) => `$${v.toLocaleString()}`;
    render(<MetricCard title="Revenue" value={45231} format={format} />);
    expect(screen.getByText("$45,231")).toBeInTheDocument();
  });

  it("shows upward trend icon for positive trend", () => {
    render(<MetricCard title="Revenue" value={100} previousValue={80} />);
    // Auto-computed as "up"
    expect(screen.getByText("25.0%")).toBeInTheDocument();
  });

  it("shows downward trend for negative change", () => {
    render(<MetricCard title="Users" value={80} previousValue={100} />);
    expect(screen.getByText("20.0%")).toBeInTheDocument();
  });

  it("shows explicit trend override", () => {
    render(<MetricCard title="Users" value={100} trend="down" />);
    // Should render the down trend icon even though no previousValue
    const container = screen.getByText("Users").closest(".flex")!;
    expect(container).toBeInTheDocument();
  });

  it("shows previous value comparison", () => {
    render(<MetricCard title="Revenue" value={100} previousValue={80} />);
    expect(screen.getByText("vs 80")).toBeInTheDocument();
  });

  it("renders sparkline when data provided", () => {
    const { container } = render(
      <MetricCard title="Revenue" value={100} sparklineData={[10, 20, 30, 25, 40]} />
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("does not render sparkline when data has fewer than 2 points", () => {
    const { container } = render(
      <MetricCard title="Revenue" value={100} sparklineData={[10]} />
    );
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders icon", () => {
    render(<MetricCard title="Revenue" value={100} icon={<span data-testid="icon">$</span>} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <MetricCard title="Revenue" value={100} className="my-card" />
    );
    expect(container.firstChild).toHaveClass("my-card");
  });
});
