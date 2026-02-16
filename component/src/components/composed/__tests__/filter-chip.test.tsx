import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FilterChip } from "../filter-chip";

describe("FilterChip", () => {
  it("renders label and value", () => {
    render(<FilterChip label="Status" value="Active" />);
    expect(screen.getByText("Status:")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("falls back to label when no value provided", () => {
    render(<FilterChip label="Status" />);
    expect(screen.getByText("Status:")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("renders remove button when onRemove is provided", () => {
    render(<FilterChip label="Status" value="Active" onRemove={() => {}} />);
    expect(screen.getByRole("button", { name: "Remove filter" })).toBeInTheDocument();
  });

  it("does not render remove button when onRemove is not provided", () => {
    render(<FilterChip label="Status" value="Active" />);
    expect(screen.queryByRole("button", { name: "Remove filter" })).not.toBeInTheDocument();
  });

  it("calls onRemove when remove button is clicked", () => {
    const onRemove = vi.fn();
    render(<FilterChip label="Status" value="Active" onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove filter" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
