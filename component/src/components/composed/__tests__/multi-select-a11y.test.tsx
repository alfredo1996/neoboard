import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { MultiSelect } from "../multi-select";

/**
 * #1284 defect 1 — checked state was carried only by a decorative <div>
 * (colour + a check glyph), so nothing in the accessibility tree separated a
 * checked option from an unchecked one.
 *
 * cmdk binds `aria-selected` to the HIGHLIGHTED item, not the selected one,
 * and spreads rest props BEFORE `role`/`aria-selected` — so passing
 * `aria-selected` through to CommandItem is clobbered. State therefore goes
 * into the option's accessible name instead.
 *
 * Scope: defect 1 only. The `value={option.label}` filtering fix (defect 2)
 * duplicates #1411 at identical lines and is left to that issue.
 */

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox"));
  return await screen.findByRole("listbox");
}

describe("#1284 — MultiSelect conveys checked state to assistive tech", () => {
  it("distinguishes checked from unchecked options by accessible name", async () => {
    const user = userEvent.setup();
    render(
      <MultiSelect options={options} value={["a", "c"]} onChange={() => {}} />,
    );
    await open(user);

    // Alpha and Gamma are checked; Beta is not.
    expect(
      screen.getByRole("option", { name: /Alpha.*(?<!not )selected/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Gamma.*(?<!not )selected/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Beta.*not selected/i }),
    ).toBeInTheDocument();
  });

  it("hides the decorative checkbox from assistive tech", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MultiSelect options={options} value={["a"]} onChange={() => {}} />,
    );
    await open(user);

    const box = container.ownerDocument.querySelector(
      '[data-slot="multi-select-indicator"]',
    );
    expect(box).not.toBeNull();
    expect(box).toHaveAttribute("aria-hidden", "true");
  });

  it("marks the option list as multi-selectable", async () => {
    const user = userEvent.setup();
    render(<MultiSelect options={options} value={[]} onChange={() => {}} />);
    const listbox = await open(user);

    expect(listbox).toHaveAttribute("aria-multiselectable", "true");
  });

  it("keeps the option's own label in its accessible name", async () => {
    const user = userEvent.setup();
    render(<MultiSelect options={options} value={[]} onChange={() => {}} />);
    const listbox = await open(user);

    // The state suffix must add to the name, not replace it.
    expect(
      within(listbox).getByRole("option", { name: /Alpha/ }),
    ).toBeInTheDocument();
  });
});
