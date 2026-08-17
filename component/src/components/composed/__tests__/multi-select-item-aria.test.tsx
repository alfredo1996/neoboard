import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { Command, CommandGroup, CommandList } from "@/components/ui/command";
import { MultiSelectItem } from "../multi-select-item";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function renderOptions(selected: string[]) {
  return render(
    <Command>
      <CommandList>
        <CommandGroup>
          {["Alpha", "Beta"].map((label) => (
            <MultiSelectItem
              key={label}
              isSelected={selected.includes(label)}
              onToggle={vi.fn()}
            >
              {label}
            </MultiSelectItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>,
  );
}

/**
 * #1283 / #1284 — cmdk drives `aria-selected` from its HIGHLIGHT state (the
 * keyboard cursor), not from whether the option is checked. The attribute is
 * therefore present and actively wrong: true for the merely-highlighted row,
 * false for every checked one. Carrying the state in the accessible name as
 * well left two contradictory signals rather than one correct one.
 */
describe("MultiSelectItem — aria-checked reflects selection, not highlight", () => {
  it("marks a checked option aria-checked", () => {
    renderOptions(["Alpha"]);
    expect(screen.getByRole("option", { name: /Alpha/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("marks an unchecked option not aria-checked", () => {
    renderOptions(["Alpha"]);
    expect(screen.getByRole("option", { name: /Beta/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("does not report the first option selected merely because cmdk highlights it", () => {
    // cmdk highlights the first item by default. With nothing checked, no
    // option may claim to be selected.
    renderOptions([]);
    for (const name of [/Alpha/, /Beta/]) {
      expect(screen.getByRole("option", { name })).toHaveAttribute(
        "aria-checked",
        "false",
      );
    }
  });

  it("keeps the option's text free of state words, so cmdk filtering is unaffected", () => {
    // The row's textContent is cmdk's filter key when `value` is omitted —
    // data-grid-faceted-filter depends on that. Appending ", selected" to the
    // label would make every row match a search for "selected".
    renderOptions(["Alpha"]);
    const option = screen.getByRole("option", { name: /Alpha/ });
    expect(option.textContent).not.toMatch(/selected/i);
  });
});
