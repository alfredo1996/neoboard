import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { WidgetCard } from "../widget-card";
import { CrossFilterTag } from "../cross-filter-tag";
import { Combobox } from "../combobox";
import { MultiSelect } from "../multi-select";

// Epic D (#1128): D2 focus-ring smoke + D3 keyboard-contract smokes.

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const RING = "focus-visible:ring-2";

describe("focus ring coverage (#1128 D2)", () => {
  it("WidgetCard drag handle carries the standard focus ring", () => {
    render(
      <WidgetCard title="W" draggable>
        <div>body</div>
      </WidgetCard>,
    );
    expect(
      screen.getByRole("button", { name: /drag to reorder/i }).className,
    ).toContain(RING);
  });

  it("CrossFilterTag (clickable) and its remove control carry the ring", () => {
    render(
      <CrossFilterTag
        field="country"
        value="IT"
        onClick={() => {}}
        onRemove={() => {}}
      />,
    );
    for (const btn of screen.getAllByRole("button")) {
      expect(btn.className).toContain(RING);
    }
  });

  it("CrossFilterTag span remove control: click and Enter/Space remove without triggering the tag click", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onRemove = vi.fn();
    render(
      <CrossFilterTag
        field="country"
        value="IT"
        onClick={onClick}
        onRemove={onRemove}
      />,
    );
    // #1283 item 4: the remove control used to be a <span role="button">
    // nested inside the tag's own <button>, so the outer button absorbed its
    // sr-only label and this had to disambiguate by tagName. They are now
    // siblings and the name is unique to the real <button>.
    const remove = screen.getByRole("button", {
      name: /remove cross-filter/i,
    });

    await user.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled(); // stopPropagation

    remove.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onRemove).toHaveBeenCalledTimes(3);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("keyboard contracts (#1128 D3)", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
  ];

  it("Combobox: Enter opens, ArrowDown navigates, Enter selects", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combobox options={options} onChange={onChange} />);

    await user.tab(); // focus trigger
    await user.keyboard("{Enter}"); // open
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}"); // move past first, select
    expect(onChange).toHaveBeenCalled();
  });

  it("MultiSelect: Enter opens the option list, Enter toggles an option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultiSelect options={options} value={[]} onChange={onChange} />);

    await user.tab();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalled();
  });
});
