import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusDot } from "../status-dot";

describe("StatusDot", () => {
  it("renders with default variant", () => {
    const { container } = render(<StatusDot />);
    expect(container.querySelector(".bg-gray-500")).toBeInTheDocument();
  });

  it("renders success variant", () => {
    const { container } = render(<StatusDot variant="success" />);
    expect(container.querySelector(".bg-green-500")).toBeInTheDocument();
  });

  it("renders warning variant", () => {
    const { container } = render(<StatusDot variant="warning" />);
    expect(container.querySelector(".bg-yellow-500")).toBeInTheDocument();
  });

  it("renders error variant", () => {
    const { container } = render(<StatusDot variant="error" />);
    expect(container.querySelector(".bg-red-500")).toBeInTheDocument();
  });

  it("renders info variant", () => {
    const { container } = render(<StatusDot variant="info" />);
    expect(container.querySelector(".bg-blue-500")).toBeInTheDocument();
  });

  it("renders label when provided", () => {
    render(<StatusDot label="Active" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("applies pulse animation", () => {
    const { container } = render(<StatusDot pulse />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("applies size variant", () => {
    const { container } = render(<StatusDot size="lg" />);
    expect(container.querySelector(".h-3")).toBeInTheDocument();
  });
});
