import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Progress } from "../progress";

describe("Progress (#1129 E1)", () => {
  it("renders a progressbar with the given value", () => {
    render(<Progress value={40} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
  });

  it("translates the indicator by the remaining percentage", () => {
    render(<Progress value={40} data-testid="p" />);
    const indicator = screen.getByTestId("p").firstElementChild as HTMLElement;
    expect(indicator.style.transform).toBe("translateX(-60%)");
  });

  it("is indeterminate when no value is given", () => {
    render(<Progress data-testid="p" />);
    const bar = screen.getByRole("progressbar");
    // Radix omits aria-valuenow in indeterminate state
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    const indicator = screen.getByTestId("p").firstElementChild as HTMLElement;
    expect(indicator.className).toContain("animate-progress-indeterminate");
    expect(indicator.className).toContain("motion-reduce:animate-none");
  });

  it("merges custom classes on the root", () => {
    render(<Progress value={10} className="h-3" data-testid="p" />);
    expect(screen.getByTestId("p").className).toContain("h-3");
  });
});
