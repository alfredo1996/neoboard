import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FilterLine } from "../filter-line";

const filters = [
  { id: "decade", label: "Decade", value: "1990s" },
  { id: "actor", label: "Actor", value: "Tom Hanks" },
];

describe("FilterLine", () => {
  it("renders each chip as '<label> is <value>' with a named remove button", () => {
    render(
      <FilterLine filters={filters} onRemove={() => {}} onReset={() => {}} />,
    );
    const chip = screen.getByText("1990s").parentElement!;
    expect(chip).toHaveTextContent("Decade is 1990s");
    expect(
      screen.getByRole("button", { name: "Remove Decade filter" }),
    ).toBeInTheDocument();
  });

  it("removes one filter by id and resets all", () => {
    const onRemove = vi.fn();
    const onReset = vi.fn();
    render(
      <FilterLine filters={filters} onRemove={onRemove} onReset={onReset} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Actor filter" }),
    );
    expect(onRemove).toHaveBeenCalledWith("actor");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when no filter is active", () => {
    const { container } = render(
      <FilterLine filters={[]} onRemove={() => {}} onReset={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("draws the remove button as a round chip", () => {
    render(
      <FilterLine filters={filters} onRemove={() => {}} onReset={() => {}} />,
    );
    const tokens = screen
      .getByRole("button", { name: "Remove Decade filter" })
      .className.split(/\s+/);
    expect(tokens).toEqual(
      expect.arrayContaining(["rounded-full", "justify-center"]),
    );
  });
});
