import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { DataGridFacetedFilter } from "../data-grid-faceted-filter";

/**
 * #1284 defect 1 for the facet filter, plus the regression the issue calls
 * for: this surface passes NO `value` prop, so cmdk filters on `textContent`.
 * MultiSelectItem appends an `sr-only` state string to that textContent, so
 * search must be proven to still work rather than assumed.
 */

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const options = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

/** Minimal stand-in for the TanStack Column surface this component uses. */
function makeColumn(filterValue: string[] = []) {
  return {
    getFilterValue: () => filterValue,
    setFilterValue: vi.fn(),
    getFacetedUniqueValues: () => new Map<string, number>(),
  } as never;
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /status/i }));
  return await screen.findByRole("listbox");
}

describe("#1284 — faceted filter selected state", () => {
  it("distinguishes checked from unchecked facets by aria-checked", async () => {
    const user = userEvent.setup();
    render(
      <DataGridFacetedFilter
        title="Status"
        options={options}
        column={makeColumn(["active"])}
      />,
    );
    await open(user);

    // State moved from an sr-only name suffix onto aria-checked. This surface
    // is the reason it mattered: the facet list omits `value`, so cmdk filters
    // on textContent — and ", selected" in the text made every facet match a
    // search for "selected".
    expect(screen.getByRole("option", { name: /Active/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("option", { name: /Inactive/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("still filters facets by typing a label", async () => {
    // The regression guard: cmdk falls back to textContent here, and
    // MultiSelectItem adds ", not selected" to it. Typing a real label must
    // still narrow the list — and nobody must "fix" this file by adding a
    // `value` prop, which would filter on the machine value instead.
    const user = userEvent.setup();
    render(
      <DataGridFacetedFilter
        title="Status"
        options={options}
        column={makeColumn()}
      />,
    );
    await open(user);

    await user.type(screen.getByPlaceholderText("Status"), "Inact");

    expect(
      screen.getByRole("option", { name: /Inactive/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /^Active/ }),
    ).not.toBeInTheDocument();
  });
});
