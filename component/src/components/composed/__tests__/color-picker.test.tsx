import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ColorPicker } from "../color-picker";

describe("ColorPicker", () => {
  it("renders trigger button with color swatch", () => {
    render(<ColorPicker value="#ef4444" />);
    expect(screen.getByText("#ef4444")).toBeInTheDocument();
  });

  it("renders trigger button with default color", () => {
    render(<ColorPicker />);
    expect(screen.getByText("#3b82f6")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<ColorPicker className="my-picker" />);
    expect(container.querySelector(".my-picker")).toBeInTheDocument();
  });
});
