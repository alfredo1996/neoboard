import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatCard } from "../stat-card";

describe("StatCard", () => {
  it("renders title and value", () => {
    render(<StatCard title="Revenue" value="$45,231" />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("$45,231")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<StatCard title="Revenue" value={100} description="from last month" />);
    expect(screen.getByText("from last month")).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(<StatCard title="Revenue" value={100} icon={<span data-testid="icon">$</span>} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("shows positive trend with percentage", () => {
    render(<StatCard title="Revenue" value={100} trend={{ value: 12 }} />);
    expect(screen.getByText("12%")).toBeInTheDocument();
  });

  it("applies green color for positive trend", () => {
    const { container } = render(<StatCard title="Revenue" value={100} trend={{ value: 12 }} />);
    expect(container.querySelector(".text-green-600")).toBeInTheDocument();
  });

  it("shows negative trend with percentage", () => {
    render(<StatCard title="Revenue" value={100} trend={{ value: -5 }} />);
    expect(screen.getByText("5%")).toBeInTheDocument();
  });

  it("applies red color for negative trend", () => {
    const { container } = render(<StatCard title="Revenue" value={100} trend={{ value: -5 }} />);
    expect(container.querySelector(".text-red-600")).toBeInTheDocument();
  });

  it("shows neutral trend for zero value", () => {
    const { container } = render(<StatCard title="Revenue" value={100} trend={{ value: 0 }} />);
    expect(container.querySelector(".text-muted-foreground")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("renders trend label when provided", () => {
    render(<StatCard title="Revenue" value={100} trend={{ value: 12, label: "vs last month" }} />);
    expect(screen.getByText("vs last month")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<StatCard title="Revenue" value={100} className="my-card" />);
    expect(container.firstChild).toHaveClass("my-card");
  });
});
