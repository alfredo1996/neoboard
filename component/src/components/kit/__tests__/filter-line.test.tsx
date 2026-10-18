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

  it("carries a filter's title on its chip, for where it came from", () => {
    render(
      <FilterLine
        filters={[{ ...filters[0], title: "Set by URL" }, filters[1]]}
        onRemove={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.getByTitle("Set by URL")).toHaveTextContent(
      "Decade is 1990s",
    );
    expect(screen.getAllByTitle(/.*/)).toHaveLength(1);
  });

  it("selects a filter from its sentence, a button beside the remove button", () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    render(
      <FilterLine
        filters={[{ ...filters[0], onSelect }, filters[1]]}
        onRemove={onRemove}
        onReset={() => {}}
      />,
    );
    const sentence = screen.getByRole("button", { name: "Decade is 1990s" });
    const remove = screen.getByRole("button", { name: "Remove Decade filter" });
    expect(sentence.contains(remove)).toBe(false);
    fireEvent.click(remove);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(sentence);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledWith("decade");
    // A filter with no onSelect stays plain text.
    expect(
      screen.queryByRole("button", { name: "Actor is Tom Hanks" }),
    ).toBeNull();
  });

  it("says the operator a filter names instead of 'is'", () => {
    render(
      <FilterLine
        filters={[
          { id: "q", label: "Name", operator: "contains", value: "mov" },
        ]}
        onRemove={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.getByText("mov").parentElement).toHaveTextContent(
      "Name contains mov",
    );
  });

  it("says the operator on a selectable sentence too", () => {
    render(
      <FilterLine
        filters={[
          {
            id: "q",
            label: "Name",
            operator: "contains",
            value: "mov",
            onSelect: () => {},
          },
        ]}
        onRemove={() => {}}
        onReset={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Name contains mov" }),
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

  it("puts the chips in a fieldset named Active filters", () => {
    render(
      <FilterLine filters={filters} onRemove={() => {}} onReset={() => {}} />,
    );
    const group = screen.getByRole("group", { name: "Active filters" });
    expect(group.tagName).toBe("FIELDSET");
    expect(group).toContainElement(
      screen.getByRole("button", { name: "Remove Decade filter" }),
    );
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
