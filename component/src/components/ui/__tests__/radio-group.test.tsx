import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RadioGroup, RadioGroupItem } from "../radio-group";

describe("RadioGroup", () => {
  it("renders items and reflects the selected value", () => {
    render(
      <RadioGroup defaultValue="a" aria-label="choices">
        <RadioGroupItem value="a" aria-label="A" />
        <RadioGroupItem value="b" aria-label="B" />
      </RadioGroup>,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toBeChecked();
  });

  it("applies the solid focus ring to items", () => {
    render(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" aria-label="A" />
      </RadioGroup>,
    );
    expect(screen.getByRole("radio")).toHaveClass("focus-visible:ring-2");
  });

  // #2218. jsdom computes no layout: assert the classes, not the pixels.
  it("is an ink ring with a dot, and its hit area reaches 24px (44px coarse)", () => {
    render(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" aria-label="A" />
      </RadioGroup>,
    );
    const radio = screen.getByRole("radio");
    expect(radio.className).toContain("data-[state=checked]:border-primary");
    expect(radio.className).toContain("after:-inset-1");
    expect(radio.className).toContain(
      "[@media(pointer:coarse)]:after:-inset-3.5",
    );
    expect(radio.querySelector("span.h-2.w-2")).not.toBeNull();
  });
});
