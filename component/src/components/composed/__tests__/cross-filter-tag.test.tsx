import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CrossFilterTag } from "../cross-filter-tag";

describe("CrossFilterTag", () => {
  const defaultProps = {
    source: "Bar Chart",
    field: "category",
    value: "Electronics",
  };

  it("renders source name", () => {
    render(<CrossFilterTag {...defaultProps} />);
    expect(screen.getByText("Bar Chart")).toBeInTheDocument();
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
});
