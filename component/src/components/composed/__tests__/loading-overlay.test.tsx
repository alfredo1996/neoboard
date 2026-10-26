import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { LoadingOverlay } from "../loading-overlay";

describe("LoadingOverlay", () => {
  it("shows overlay with spinner when loading", () => {
    const { container } = render(
      <LoadingOverlay loading>
        <p>Content</p>
      </LoadingOverlay>,
    );
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders children underneath the overlay", () => {
    render(
      <LoadingOverlay loading>
        <p>Content</p>
      </LoadingOverlay>,
    );
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("shows loading text when provided", () => {
    render(
      <LoadingOverlay loading text="Loading data...">
        <p>Content</p>
      </LoadingOverlay>,
    );
    expect(screen.getByText("Loading data...")).toBeInTheDocument();
  });

  it("does not show overlay when not loading", () => {
    const { container } = render(
      <LoadingOverlay loading={false}>
        <p>Content</p>
      </LoadingOverlay>,
    );
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("defaults to loading=true", () => {
    const { container } = render(
      <LoadingOverlay>
        <p>Content</p>
      </LoadingOverlay>,
    );
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("puts its text in a status region that names the subject", () => {
    render(
      <LoadingOverlay loading text="Loading dashboards…">
        <p>Content</p>
      </LoadingOverlay>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading dashboards…");
  });

  it("says Loading… when given no text", () => {
    render(
      <LoadingOverlay>
        <p>Content</p>
      </LoadingOverlay>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });

  it("keeps room for the spinner over empty content, at the mock's sizes", () => {
    const { container } = render(<LoadingOverlay />);
    expect(container.firstElementChild).toHaveClass("min-h-40");
    expect(container.querySelector(".animate-spin")).toHaveClass("h-6", "w-6");
    expect(screen.getByText("Loading…")).toHaveClass("text-[13px]");
  });

  it("does not blur what is underneath", () => {
    const { container } = render(
      <LoadingOverlay loading text="Loading dashboards…">
        <p>Content</p>
      </LoadingOverlay>,
    );
    expect(container.innerHTML).not.toContain("backdrop-blur");
  });
});
