import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { LoadingButton } from "../loading-button";

describe("LoadingButton", () => {
  it("renders children", () => {
    render(<LoadingButton>Submit</LoadingButton>);
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });

  it("defaults to the primary (default) variant, not a muted one (#1059)", () => {
    // Settings "Save" uses LoadingButton with no variant — it must read as a
    // primary action (bg-primary), not secondary/muted.
    render(<LoadingButton>Save</LoadingButton>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.className).toContain("bg-primary");
    expect(btn.className).not.toContain("bg-secondary");
  });

  it("shows spinner when loading", () => {
    const { container } = render(<LoadingButton loading>Submit</LoadingButton>);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows loadingText when loading", () => {
    render(
      <LoadingButton loading loadingText="Saving...">
        Submit
      </LoadingButton>,
    );
    expect(screen.getByText("Saving...")).toBeInTheDocument();
    expect(screen.queryByText("Submit")).not.toBeInTheDocument();
  });

  it("is disabled when loading", () => {
    render(<LoadingButton loading>Submit</LoadingButton>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is disabled when disabled prop is true", () => {
    render(<LoadingButton disabled>Submit</LoadingButton>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("does not show spinner when not loading", () => {
    const { container } = render(<LoadingButton>Submit</LoadingButton>);
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("forwards button variant prop", () => {
    render(<LoadingButton variant="destructive">Delete</LoadingButton>);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
