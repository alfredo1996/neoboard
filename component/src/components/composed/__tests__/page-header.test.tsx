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
    render(
      <PageHeader title="Dashboard" breadcrumb={<nav>Home / Dashboard</nav>} />,
    );
    expect(screen.getByText("Home / Dashboard")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <PageHeader title="Dashboard" className="my-header" />,
    );
    expect(container.firstChild).toHaveClass("my-header");
  });

  it("renders the title at the v1.1 type scale (text-lg / font-semibold, #1058)", () => {
    render(<PageHeader title="Dashboard" />);
    const title = screen.getByRole("heading", { level: 1, name: "Dashboard" });
    expect(title).toHaveClass("text-lg", "font-semibold");
    // The scale stops at text-lg; bold is reserved for metric emphasis.
    expect(title).not.toHaveClass("text-2xl");
    expect(title).not.toHaveClass("font-bold");
  });

  it("renders the description at text-sm (#1058)", () => {
    render(<PageHeader title="Dashboard" description="Overview of metrics" />);
    expect(screen.getByText("Overview of metrics")).toHaveClass(
      "text-sm",
      "text-muted-foreground",
    );
  });
});
