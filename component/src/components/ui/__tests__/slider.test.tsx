import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Slider } from "../slider";

/**
 * The base Slider must render one thumb per value (#1161). A single hardcoded
 * thumb left the number-range parameter with only one knob even though it
 * models a [min, max] tuple. Radix renders a thumb per value entry, so the
 * thumb count must track the value/defaultValue array length.
 */
describe("Slider", () => {
  it("renders a single thumb for a single-value slider", () => {
    render(<Slider value={[50]} min={0} max={100} aria-label="v" />);
    expect(screen.getAllByRole("slider")).toHaveLength(1);
  });

  it("renders two thumbs for a range slider", () => {
    render(<Slider value={[20, 80]} min={0} max={100} />);
    expect(screen.getAllByRole("slider")).toHaveLength(2);
  });

  it("tracks defaultValue length when uncontrolled", () => {
    render(<Slider defaultValue={[10, 90]} min={0} max={100} />);
    expect(screen.getAllByRole("slider")).toHaveLength(2);
  });

  it("falls back to a single thumb when no value is given", () => {
    render(<Slider min={0} max={100} aria-label="v" />);
    expect(screen.getAllByRole("slider")).toHaveLength(1);
  });

  // #2218. jsdom computes no layout: assert the classes, not the pixels.
  it("has a 2px track and ink-edged thumbs whose hit area reaches 24px (44px coarse)", () => {
    const { container } = render(
      <Slider value={[50]} min={0} max={100} aria-label="v" />,
    );
    expect(container.querySelector(".h-0\\.5")).not.toBeNull();
    const cls = screen.getByRole("slider").className;
    expect(cls).toContain("border-primary");
    expect(cls).toContain("after:-inset-1");
    expect(cls).toContain("[@media(pointer:coarse)]:after:-inset-3.5");
  });
});
