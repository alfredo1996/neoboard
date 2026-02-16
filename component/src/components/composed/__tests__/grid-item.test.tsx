import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GridItem } from "../grid-item";

describe("GridItem", () => {
  it("renders children", () => {
    render(<GridItem id="item-1">Content</GridItem>);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("applies h-full and overflow-hidden classes", () => {
    const { container } = render(<GridItem id="item-1">Content</GridItem>);
    expect(container.firstChild).toHaveClass("h-full", "overflow-hidden");
  });

  it("applies custom className", () => {
    const { container } = render(<GridItem id="item-1" className="my-item">Content</GridItem>);
    expect(container.firstChild).toHaveClass("my-item");
  });
});
