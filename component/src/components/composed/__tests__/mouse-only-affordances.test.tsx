import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Slider } from "@/components/ui/slider";

/**
 * #1283 — controls or their explanatory content reachable only with a pointer.
 *
 * Items 2 and 5 of the checklist. Both are fixed by putting the information
 * into the accessibility tree rather than adding focus management to elements
 * that cannot take focus.
 */

describe("#1283 item 5 — slider forwards its label to the thumbs", () => {
  it("labels a single-thumb slider", () => {
    render(<Slider aria-label="Opacity" defaultValue={[50]} max={100} />);
    // Radix puts role="slider" on the THUMB, so a label on Root never reaches it.
    expect(screen.getByRole("slider")).toHaveAccessibleName("Opacity");
  });

  it("qualifies each thumb of a range slider", () => {
    render(<Slider aria-label="Price" defaultValue={[10, 90]} max={100} />);
    const thumbs = screen.getAllByRole("slider");
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]).toHaveAccessibleName(/Price minimum/i);
    expect(thumbs[1]).toHaveAccessibleName(/Price maximum/i);
  });

  it("gives each range thumb a distinct name under aria-labelledby", () => {
    // A single shared id names BOTH thumbs identically, leaving a range slider
    // with two indistinguishable knobs. aria-labelledby takes an id list, so a
    // per-thumb qualifier span is appended rather than replacing the caller's
    // label.
    render(
      <>
        <span id="range-label">Price</span>
        <Slider
          aria-labelledby="range-label"
          defaultValue={[10, 90]}
          max={100}
        />
      </>,
    );
    const [lo, hi] = screen.getAllByRole("slider");
    expect(lo).toHaveAccessibleName(/Price.*minimum/i);
    expect(hi).toHaveAccessibleName(/Price.*maximum/i);
  });

  it("supports aria-labelledby as well", () => {
    render(
      <>
        <span id="vol-label">Volume</span>
        <Slider aria-labelledby="vol-label" defaultValue={[30]} max={100} />
      </>,
    );
    expect(screen.getByRole("slider")).toHaveAccessibleName("Volume");
  });
});
