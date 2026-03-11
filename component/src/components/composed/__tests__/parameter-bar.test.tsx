import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ParameterBar } from "../parameter-bar";

describe("ParameterBar", () => {
  it("renders children", () => {
    render(
      <ParameterBar>
        <span>Param 1</span>
        <span>Param 2</span>
      </ParameterBar>
    );
    expect(screen.getByText("Param 1")).toBeInTheDocument();
    expect(screen.getByText("Param 2")).toBeInTheDocument();
  });

  it("renders Apply button when onApply is provided", () => {
    render(
      <ParameterBar onApply={vi.fn()}>
        <span>Param</span>
      </ParameterBar>
    );
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
  });

  it("renders Reset button when onReset is provided", () => {
    render(
      <ParameterBar onReset={vi.fn()}>
        <span>Param</span>
      </ParameterBar>
    );
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("does not render buttons when no handlers", () => {
    render(
      <ParameterBar>
        <span>Param</span>
      </ParameterBar>
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onApply when Apply clicked", () => {
    const onApply = vi.fn();
    render(
      <ParameterBar onApply={onApply}>
        <span>Param</span>
      </ParameterBar>
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("calls onReset when Reset clicked", () => {
    const onReset = vi.fn();
    render(
      <ParameterBar onReset={onReset}>
        <span>Param</span>
      </ParameterBar>
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("renders custom button labels", () => {
    render(
      <ParameterBar onApply={vi.fn()} onReset={vi.fn()} applyLabel="Run" resetLabel="Clear">
        <span>Param</span>
      </ParameterBar>
    );
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  it("renders horizontal orientation by default", () => {
    const { container } = render(
      <ParameterBar>
        <span>Param</span>
      </ParameterBar>
    );
    expect(container.firstChild).toHaveAttribute("data-orientation", "horizontal");
  });

  it("renders vertical orientation", () => {
    const { container } = render(
      <ParameterBar orientation="vertical">
        <span>Param</span>
      </ParameterBar>
    );
    expect(container.firstChild).toHaveAttribute("data-orientation", "vertical");
  });

  it("applies custom className", () => {
    const { container } = render(
      <ParameterBar className="custom-bar">
        <span>Param</span>
      </ParameterBar>
    );
    expect(container.firstChild).toHaveClass("custom-bar");
  });

  // ── Collapsible behavior ──────────────────────────────────────────────

  describe("collapsible", () => {
    it("renders a collapse toggle button when collapsible is true", () => {
      render(
        <ParameterBar collapsible>
          <span>Param 1</span>
        </ParameterBar>
      );
      expect(
        screen.getByRole("button", { name: /collapse/i })
      ).toBeInTheDocument();
    });

    it("does not render a toggle button when collapsible is false (default)", () => {
      render(
        <ParameterBar>
          <span>Param 1</span>
        </ParameterBar>
      );
      expect(
        screen.queryByRole("button", { name: /collapse|expand/i })
      ).not.toBeInTheDocument();
    });

    it("shows children when expanded (default)", () => {
      render(
        <ParameterBar collapsible>
          <span>Param 1</span>
        </ParameterBar>
      );
      expect(screen.getByText("Param 1")).toBeVisible();
    });

    it("hides children when collapsed via defaultCollapsed", () => {
      render(
        <ParameterBar collapsible defaultCollapsed>
          <span>Param 1</span>
        </ParameterBar>
      );
      // Children should not be visible when collapsed
      expect(screen.queryByText("Param 1")).not.toBeInTheDocument();
    });

    it("toggles children visibility when toggle is clicked", () => {
      render(
        <ParameterBar collapsible>
          <span>Param 1</span>
        </ParameterBar>
      );
      // Initially expanded
      expect(screen.getByText("Param 1")).toBeVisible();

      // Click to collapse
      fireEvent.click(screen.getByRole("button", { name: /collapse/i }));
      expect(screen.queryByText("Param 1")).not.toBeInTheDocument();

      // Click to expand
      fireEvent.click(screen.getByRole("button", { name: /expand/i }));
      expect(screen.getByText("Param 1")).toBeVisible();
    });

    it("shows badge count when collapsed", () => {
      render(
        <ParameterBar collapsible defaultCollapsed parameterCount={3}>
          <span>Param 1</span>
          <span>Param 2</span>
          <span>Param 3</span>
        </ParameterBar>
      );
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("does not show badge count when expanded", () => {
      render(
        <ParameterBar collapsible parameterCount={3}>
          <span>Param 1</span>
          <span>Param 2</span>
          <span>Param 3</span>
        </ParameterBar>
      );
      // Badge should not be visible when expanded
      expect(screen.queryByText("3")).not.toBeInTheDocument();
    });

    it("hides action buttons (Apply/Reset) when collapsed", () => {
      render(
        <ParameterBar
          collapsible
          defaultCollapsed
          onApply={vi.fn()}
          onReset={vi.fn()}
          parameterCount={1}
        >
          <span>Param</span>
        </ParameterBar>
      );
      expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
    });
  });
});
