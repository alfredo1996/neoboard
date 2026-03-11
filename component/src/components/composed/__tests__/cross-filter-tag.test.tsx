import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CrossFilterTag } from "../cross-filter-tag";

describe("CrossFilterTag", () => {
  const defaultProps = {
    source: "Bar Chart",
    field: "category",
    value: "Electronics",
  };

  it("does not render source name (simplified display)", () => {
    render(<CrossFilterTag {...defaultProps} />);
    expect(screen.queryByText("Bar Chart")).not.toBeInTheDocument();
  });

  it("renders field name", () => {
    render(<CrossFilterTag {...defaultProps} />);
    expect(screen.getByText("category")).toBeInTheDocument();
  });

  it("renders value", () => {
    render(<CrossFilterTag {...defaultProps} />);
    expect(screen.getByText("Electronics")).toBeInTheDocument();
  });

  it("renders equals sign", () => {
    render(<CrossFilterTag {...defaultProps} />);
    expect(screen.getByText("=")).toBeInTheDocument();
  });

  it("renders filter icon", () => {
    const { container } = render(<CrossFilterTag {...defaultProps} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders remove button when onRemove is provided", () => {
    render(<CrossFilterTag {...defaultProps} onRemove={vi.fn()} />);
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("does not render remove button when onRemove is not provided", () => {
    render(<CrossFilterTag {...defaultProps} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onRemove when remove button clicked", () => {
    const onRemove = vi.fn();
    render(<CrossFilterTag {...defaultProps} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("applies custom className", () => {
    const { container } = render(
      <CrossFilterTag {...defaultProps} className="custom-tag" />
    );
    expect(container.firstChild).toHaveClass("custom-tag");
  });

  // ── Simplified display (no source) ──────────────────────────────────

  it("does not render the source prop (simplified display)", () => {
    render(<CrossFilterTag {...defaultProps} />);
    // Source should NOT appear in simplified display
    expect(screen.queryByText("Bar Chart")).not.toBeInTheDocument();
  });

  // ── onClick handler ──────────────────────────────────────────────────

  it("calls onClick when the tag badge is clicked", () => {
    const onClick = vi.fn();
    render(<CrossFilterTag {...defaultProps} onClick={onClick} />);
    // Click on the badge itself (not the remove button)
    fireEvent.click(screen.getByText("category"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not throw when clicked without onClick handler", () => {
    render(<CrossFilterTag {...defaultProps} />);
    expect(() => fireEvent.click(screen.getByText("category"))).not.toThrow();
  });

  // ── Tooltip ──────────────────────────────────────────────────────────

  it("renders tooltip content when tooltip prop is provided", () => {
    render(<CrossFilterTag {...defaultProps} tooltip="Set by Bar Chart" />);
    // The tooltip should be in the DOM (accessible via title attribute)
    expect(screen.getByTitle("Set by Bar Chart")).toBeInTheDocument();
  });

  it("does not render a title when tooltip is not provided", () => {
    const { container } = render(<CrossFilterTag {...defaultProps} />);
    // The badge element should not have a title attribute
    expect(container.firstChild).not.toHaveAttribute("title");
  });
});
