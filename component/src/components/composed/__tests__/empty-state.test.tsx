import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EmptyState } from "../empty-state";

describe("EmptyState", () => {
  it("renders title", () => {
    render(<EmptyState title="No results" />);
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<EmptyState title="No results" description="Try adjusting your search" />);
    expect(screen.getByText("Try adjusting your search")).toBeInTheDocument();
  });

  it("does not render description when not provided", () => {
    render(<EmptyState title="No results" />);
    expect(screen.queryByText("Try adjusting your search")).not.toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(<EmptyState title="No results" icon={<span data-testid="icon">!</span>} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders action when provided", () => {
    render(<EmptyState title="No results" action={<button>Create new</button>} />);
    expect(screen.getByRole("button", { name: "Create new" })).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<EmptyState title="No results" className="my-class" />);
    expect(container.firstChild).toHaveClass("my-class");
  });
});
