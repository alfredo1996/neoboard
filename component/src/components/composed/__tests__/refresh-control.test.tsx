import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RefreshControl } from "../refresh-control";

describe("RefreshControl", () => {
  it("renders toggle button", () => {
    render(<RefreshControl />);
    expect(screen.getByRole("button", { name: "Off" })).toBeInTheDocument();
  });

  it("shows 'Auto' when enabled", () => {
    render(<RefreshControl enabled />);
    expect(screen.getByRole("button", { name: "Auto" })).toBeInTheDocument();
  });

  it("calls onToggle when toggle clicked", () => {
    const onToggle = vi.fn();
    render(<RefreshControl onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Off" }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("calls onToggle with false when disabling", () => {
    const onToggle = vi.fn();
    render(<RefreshControl enabled onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("shows interval selector when enabled", () => {
    render(<RefreshControl enabled />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("hides interval selector when disabled", () => {
    render(<RefreshControl />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders refresh now button when onRefreshNow provided", () => {
    render(<RefreshControl onRefreshNow={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeInTheDocument();
  });

  it("calls onRefreshNow when clicked", () => {
    const onRefreshNow = vi.fn();
    render(<RefreshControl onRefreshNow={onRefreshNow} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    expect(onRefreshNow).toHaveBeenCalledTimes(1);
  });

  it("disables refresh button when refreshing", () => {
    render(<RefreshControl onRefreshNow={vi.fn()} refreshing />);
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeDisabled();
  });

  it("shows spin animation when refreshing", () => {
    const { container } = render(<RefreshControl onRefreshNow={vi.fn()} refreshing />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<RefreshControl className="custom-refresh" />);
    expect(container.firstChild).toHaveClass("custom-refresh");
  });
});
