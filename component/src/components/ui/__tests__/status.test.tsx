import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Status, type StatusTone } from "../status";

const tones: StatusTone[] = ["good", "none", "pending", "failed"];

describe("Status", () => {
  it.each(tones)("renders its word for tone %s", (tone) => {
    render(<Status tone={tone}>Some word</Status>);
    expect(screen.getByText("Some word")).toBeInTheDocument();
  });

  it("hides the shape from assistive tech", () => {
    const { container } = render(<Status tone="good">Connected</Status>);
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("draws a distinct shape per tone, so colour is not the only signal", () => {
    const shapes = tones.map((tone) => {
      const { container, unmount } = render(<Status tone={tone}>x</Status>);
      const value = container
        .querySelector("[data-shape]")
        ?.getAttribute("data-shape");
      unmount();
      return value;
    });
    expect(shapes.every(Boolean)).toBe(true);
    expect(new Set(shapes).size).toBe(tones.length);
  });
});
