import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Combobox } from "../combobox";

const options = [
  { value: "next.js", label: "Next.js" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
];

describe("Combobox", () => {
  it("renders placeholder when no value selected", () => {
    render(<Combobox options={options} placeholder="Select..." />);
    expect(screen.getByText("Select...")).toBeInTheDocument();
  });

  it("renders default placeholder", () => {
    render(<Combobox options={options} />);
    expect(screen.getByText("Select option...")).toBeInTheDocument();
  });

  it("renders selected option label", () => {
    render(<Combobox options={options} value="next.js" />);
    expect(screen.getByText("Next.js")).toBeInTheDocument();
  });

  it("renders combobox role with correct aria-expanded", () => {
    render(<Combobox options={options} />);
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("is disabled when disabled prop is true", () => {
    render(<Combobox options={options} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("shows placeholder when value doesn't match any option", () => {
    render(<Combobox options={options} value="nonexistent" />);
    // When value doesn't match, selectedOption is undefined, so placeholder shows
    expect(screen.getByText("Select option...")).toBeInTheDocument();
  });
});
