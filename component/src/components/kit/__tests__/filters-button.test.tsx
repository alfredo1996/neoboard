import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FiltersButton, type FiltersButtonItem } from "../filters-button";

const item = (
  i: number,
  value?: string,
  extra: Partial<FiltersButtonItem> = {},
): FiltersButtonItem => ({
  id: `p${i}`,
  label: `Filter ${i}`,
  value,
  where: `Selector ${i} · Page`,
  ...extra,
});

function open(items: FiltersButtonItem[]) {
  const props = { onClear: vi.fn(), onClearAll: vi.fn() };
  render(<FiltersButton items={items} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
  return props;
}

const many = (n: number) => Array.from({ length: n }, (_, i) => item(i));

describe("FiltersButton", () => {
  it("is absent on a dashboard with no filters", () => {
    const { container } = render(
      <FiltersButton items={[]} onClear={() => {}} onClearAll={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("counts the filters that are set", () => {
    render(
      <FiltersButton
        items={[item(1, "a"), item(2), item(3, "c")]}
        onClear={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByLabelText("2 set")).toHaveTextContent("2");
  });

  it("shows no count when none is set", () => {
    render(
      <FiltersButton
        items={[item(1)]}
        onClear={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.queryByLabelText(/ set$/)).toBeNull();
  });

  it("lists set filters first, then unset ones as Any, with where each is set", () => {
    open([item(1), item(2, "x"), item(3), item(4, "y")]);
    const rows = within(
      screen.getByRole("dialog", { name: "Filters" }),
    ).getAllByRole("listitem");
    expect(rows.map((r) => /Filter \d/.exec(r.textContent ?? "")?.[0])).toEqual(
      ["Filter 2", "Filter 4", "Filter 1", "Filter 3"],
    );
    expect(rows[0]).toHaveTextContent("x");
    expect(rows[0]).toHaveTextContent("Selector 2 · Page");
    expect(rows[2]).toHaveTextContent("Any");
  });

  it("has no search box at 8 filters", () => {
    open(many(8));
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("has a search box at 9 filters, and it narrows the list", () => {
    open(many(9));
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a filter" }), {
      target: { value: "filter 7" },
    });
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Filter 7");
  });

  it("caps the list height so it scrolls", () => {
    open([item(1, "a")]);
    const tokens = screen.getByRole("list").className.split(/\s+/);
    expect(tokens).toContain("max-h-[300px]");
    expect(tokens).toContain("overflow-y-auto");
  });

  it("jumps to a filter's selector and closes", () => {
    const onSelect = vi.fn();
    open([item(1, "a", { onSelect })]);
    fireEvent.click(screen.getByRole("button", { name: /^Filter 1/ }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clears one filter with its ×, offered only on set filters", () => {
    const { onClear } = open([item(1, "a"), item(2)]);
    expect(screen.queryByRole("button", { name: "Clear Filter 2" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear Filter 1" }));
    expect(onClear).toHaveBeenCalledWith("p1");
  });

  it("clears all", () => {
    const { onClearAll } = open([item(1, "a")]);
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onClearAll).toHaveBeenCalledOnce();
  });
});
