import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { LoadingButton } from "../loading-button";

describe("LoadingButton", () => {
  it("renders children", () => {
    render(<LoadingButton>Submit</LoadingButton>);
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });

  it("is an enabled button when idle, not busy", () => {
    render(<LoadingButton>Save</LoadingButton>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeEnabled();
    expect(btn).not.toHaveAttribute("aria-busy");
  });

  it("sets aria-busy while loading and is named by what it is doing", () => {
    render(
      <LoadingButton loading loadingText="Saving...">
        Save
      </LoadingButton>,
    );
    expect(screen.getByRole("button", { name: "Saving..." })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("keeps the width it had before loading", () => {
    const widthSpy = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockReturnValue(120);
    const { rerender } = render(<LoadingButton>Save</LoadingButton>);
    rerender(
      <LoadingButton loading loadingText="Saving...">
        Save
      </LoadingButton>,
    );
    expect(screen.getByRole("button")).toHaveStyle({ minWidth: "120px" });
    widthSpy.mockRestore();
  });

  it("re-measures the idle width on every idle commit", () => {
    let width = 120;
    const widthSpy = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockImplementation(() => width);
    const { rerender } = render(<LoadingButton>Save</LoadingButton>);
    width = 80;
    rerender(<LoadingButton>Save</LoadingButton>);
    rerender(<LoadingButton loading>Save</LoadingButton>);
    expect(screen.getByRole("button")).toHaveStyle({ minWidth: "80px" });
    widthSpy.mockRestore();
  });

  it("forwards its ref to the button", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<LoadingButton ref={ref}>Save</LoadingButton>);
    expect(ref.current).toBe(screen.getByRole("button"));
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
    render(<LoadingButton variant="danger">Delete</LoadingButton>);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
