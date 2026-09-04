import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EmptyState } from "../empty-state";

describe("EmptyState", () => {
  it("renders title", () => {
    render(<EmptyState title="No results" />);
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <EmptyState title="No results" description="Try adjusting your search" />,
    );
    expect(screen.getByText("Try adjusting your search")).toBeInTheDocument();
  });

  it("does not render description when not provided", () => {
    render(<EmptyState title="No results" />);
    expect(
      screen.queryByText("Try adjusting your search"),
    ).not.toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(
      <EmptyState
        title="No results"
        icon={<span data-testid="icon">!</span>}
      />,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders action when provided", () => {
    render(
      <EmptyState title="No results" action={<button>Create new</button>} />,
    );
    expect(
      screen.getByRole("button", { name: "Create new" }),
    ).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <EmptyState title="No results" className="my-class" />,
    );
    expect(container.firstChild).toHaveClass("my-class");
  });

  it("renders secondaryAction when provided", () => {
    render(
      <EmptyState
        title="No results"
        action={<button>Create new</button>}
        secondaryAction={<a href="/docs">Read the docs</a>}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Read the docs" }),
    ).toBeInTheDocument();
  });

  it("does not render secondaryAction container when not provided", () => {
    render(
      <EmptyState title="No results" action={<button>Create new</button>} />,
    );
    expect(
      screen.queryByRole("link", { name: "Read the docs" }),
    ).not.toBeInTheDocument();
  });

  it("renders secondaryAction even when primary action is absent", () => {
    render(
      <EmptyState
        title="No results"
        secondaryAction={<a href="/docs">Read the docs</a>}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Read the docs" }),
    ).toBeInTheDocument();
  });

  it("puts an explicit role on the root so a host can announce the state", () => {
    // Opt-in only: a widget reporting "no rows" is a live region, a modal's
    // static empty state is not (#1584).
    const { container } = render(<EmptyState title="No data" role="status" />);
    expect(container.firstElementChild).toHaveAttribute("role", "status");
  });

  it("has no role by default", () => {
    const { container } = render(<EmptyState title="No results" />);
    expect(container.firstElementChild).not.toHaveAttribute("role");
  });
});
