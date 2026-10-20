import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "../checkbox";

describe("Checkbox (#2218)", () => {
  it("toggles aria-checked from the keyboard", async () => {
    render(<Checkbox aria-label="Agree" />);
    const box = screen.getByRole("checkbox", { name: "Agree" });
    expect(box).toHaveAttribute("aria-checked", "false");
    await userEvent.tab();
    await userEvent.keyboard(" ");
    expect(box).toHaveAttribute("aria-checked", "true");
  });

  it("reports mixed for the indeterminate state", () => {
    render(<Checkbox aria-label="All" checked="indeterminate" />);
    const box = screen.getByRole("checkbox", { name: "All" });
    expect(box).toHaveAttribute("aria-checked", "mixed");
    expect(box).toHaveAttribute("data-state", "indeterminate");
  });

  // jsdom applies no CSS: the dash and the tick swap on the root's data-state,
  // so assert the classes that do the swap (the screenshots show the result).
  it("swaps the tick for a dash when indeterminate", () => {
    render(<Checkbox aria-label="All" checked="indeterminate" />);
    const box = screen.getByRole("checkbox", { name: "All" });
    const tick = box.querySelector("svg.lucide-check");
    const dash = box.querySelector("svg.lucide-minus");
    expect(tick?.getAttribute("class")).toContain(
      "group-data-[state=indeterminate]:hidden",
    );
    expect(dash?.getAttribute("class")).toContain(
      "group-data-[state=indeterminate]:block",
    );
  });

  // jsdom computes no layout: assert the classes that grow the hit area.
  it("extends its hit area to 24px, and 44px on a coarse pointer", () => {
    render(<Checkbox aria-label="x" />);
    const cls = screen.getByRole("checkbox").className;
    expect(cls).toContain("after:-inset-1");
    expect(cls).toContain("[@media(pointer:coarse)]:after:-inset-3.5");
  });
});
