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

  it("applies the solid citrine focus ring to items", () => {
    render(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" aria-label="A" />
      </RadioGroup>,
    );
    expect(screen.getByRole("radio")).toHaveClass("focus-visible:ring-2");
  });
});
