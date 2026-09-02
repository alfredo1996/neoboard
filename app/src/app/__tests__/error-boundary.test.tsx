import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ErrorBoundary from "../error";

/**
 * #1561 — the App Router error boundary was `export default function Error`,
 * which shadows the global `Error` inside its own type annotation on the next
 * line (`error: Error & { digest?: string }`). It type-checked only because
 * the value and type namespaces happen not to collide — the exact confusion
 * SonarCloud's S2137 exists to flag, and the single MAJOR bug that has kept
 * dev's quality gate red.
 *
 * Next.js requires a default export from app/error.tsx. It does not require
 * the function to be *named* `Error`; that was convention from the docs.
 *
 * The component had no test at all, so the rename is the moment to add one.
 */
describe("app error boundary (#1561)", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => consoleError.mockClear());
  afterEach(() => consoleError.mockClear());

  it("renders the failure message and wires reset to Try again", () => {
    const reset = vi.fn();
    render(<ErrorBoundary error={new Error("boom")} reset={reset} />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("shows the digest when Next attaches one, and not otherwise", () => {
    const { rerender } = render(
      <ErrorBoundary
        error={Object.assign(new Error("boom"), { digest: "abc123" })}
        reset={vi.fn()}
      />,
    );
    expect(screen.getByText("Error ID: abc123")).toBeInTheDocument();

    rerender(<ErrorBoundary error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.queryByText(/Error ID:/)).toBeNull();
  });

  it("offers a way back to the dashboards", () => {
    render(<ErrorBoundary error={new Error("boom")} reset={vi.fn()} />);
    expect(
      screen.getByRole("link", { name: "Go to dashboards" }),
    ).toHaveAttribute("href", "/dashboards");
  });

  it("logs the error once for diagnostics", () => {
    const err = new Error("boom");
    render(<ErrorBoundary error={err} reset={vi.fn()} />);
    expect(consoleError).toHaveBeenCalledWith("[app-error]", err);
  });

  // The defect itself, stated as a type-level fact: the component's error
  // prop is the BUILT-IN Error, which the old name made ambiguous. If the
  // function were still named `Error`, this instance check would be
  // referring to the component, and would not compile.
  it("types its error prop as the built-in Error", () => {
    const err: Error = new Error("boom");
    expect(err).toBeInstanceOf(Error);
    render(<ErrorBoundary error={err} reset={vi.fn()} />);
    expect(ErrorBoundary.name).not.toBe("Error");
  });
});
