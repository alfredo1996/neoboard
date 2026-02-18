import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { LoadingOverlay } from "../loading-overlay";

describe("LoadingOverlay", () => {
  it("shows overlay with spinner when loading", () => {
    const { container } = render(
      <LoadingOverlay loading>
        <p>Content</p>
      </LoadingOverlay>
    );
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders children underneath the overlay", () => {
    render(
      <LoadingOverlay loading>
        <p>Content</p>
      </LoadingOverlay>
    );
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("shows loading text when provided", () => {
    render(
      <LoadingOverlay loading text="Loading data...">
        <p>Content</p>
      </LoadingOverlay>
    );
    expect(screen.getByText("Loading data...")).toBeInTheDocument();
  });

  it("does not show overlay when not loading", () => {
    const { container } = render(
      <LoadingOverlay loading={false}>
        <p>Content</p>
      </LoadingOverlay>
    );
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("defaults to loading=true", () => {
    const { container } = render(
      <LoadingOverlay>
        <p>Content</p>
      </LoadingOverlay>
    );
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });
});
