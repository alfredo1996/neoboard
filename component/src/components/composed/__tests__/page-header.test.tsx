import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PageHeader } from "../page-header";

describe("PageHeader", () => {
  it("renders title", () => {
    render(<PageHeader title="Dashboard" />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<PageHeader title="Dashboard" description="Overview of metrics" />);
    expect(screen.getByText("Overview of metrics")).toBeInTheDocument();
  });

  it("does not render description when not provided", () => {
    const { container } = render(<PageHeader title="Dashboard" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("renders actions when provided", () => {
    render(<PageHeader title="Dashboard" actions={<button>Export</button>} />);
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });

  it("renders breadcrumb when provided", () => {
    render(<PageHeader title="Dashboard" breadcrumb={<nav>Home / Dashboard</nav>} />);
    expect(screen.getByText("Home / Dashboard")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<PageHeader title="Dashboard" className="my-header" />);
    expect(container.firstChild).toHaveClass("my-header");
  });
});
