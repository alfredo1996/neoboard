import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Skeleton } from "../skeleton";

describe("Skeleton", () => {
  it("pulses only behind motion-safe, so reduced motion gets a static block", () => {
    const { container } = render(<Skeleton />);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain("motion-safe:animate-skeleton-pulse");
    expect(cls).not.toMatch(/(^|\s)animate-/);
  });

  it("has no shimmer sweep", () => {
    const { container } = render(<Skeleton />);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).not.toContain("shimmer");
    expect(cls).not.toContain("before:");
  });

  it("fills with the skeleton token", () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstElementChild).toHaveClass("bg-skeleton", "h-4");
  });
});
