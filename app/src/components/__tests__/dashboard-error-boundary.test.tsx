import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DashboardErrorBoundary } from "../dashboard-error-boundary";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Boom");
  return <div>OK</div>;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("DashboardErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <DashboardErrorBoundary>
        <div>Dashboard content</div>
      </DashboardErrorBoundary>,
    );
    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
  });

  it("shows fallback UI when a child throws", () => {
    render(
      <DashboardErrorBoundary>
        <ThrowingChild shouldThrow />
      </DashboardErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("recovers when 'Try again' is clicked", () => {
    const { rerender } = render(
      <DashboardErrorBoundary>
        <ThrowingChild shouldThrow />
      </DashboardErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Rerender with non-throwing child, then click retry
    rerender(
      <DashboardErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </DashboardErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText("OK")).toBeInTheDocument();
  });
});
