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
});
