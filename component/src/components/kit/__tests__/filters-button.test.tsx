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
  where: `on Page ${i}`,
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
    expect(rows[0]).toHaveTextContent("on Page 2");
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
    const tokens = screen.getByTestId("filters-scroll").className.split(/\s+/);
    expect(tokens).toContain("max-h-[300px]");
    expect(tokens).toContain("overflow-y-auto");
  });

  it("jumps to a filter's selector and closes", () => {
    const onSelect = vi.fn();
    open([item(1, "a", { onSelect })]);
    fireEvent.click(screen.getByRole("button", { name: /^Go to Filter 1 / }));
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

  it("heads the list with Set and Not set, only for groups that have rows", () => {
    open([item(1), item(2, "x")]);
    expect(screen.getByText("Set")).toBeInTheDocument();
    expect(screen.getByText("Not set")).toBeInTheDocument();
  });

  it("makes each group a list named by its heading", () => {
    open([item(1), item(2, "x"), item(3, "y")]);
    const set = within(screen.getByRole("list", { name: "Set" }));
    const unset = within(screen.getByRole("list", { name: "Not set" }));
    expect(
      set
        .getAllByRole("listitem")
        .map((r) => /Filter \d/.exec(r.textContent ?? "")?.[0]),
    ).toEqual(["Filter 2", "Filter 3"]);
    expect(
      unset
        .getAllByRole("listitem")
        .map((r) => /Filter \d/.exec(r.textContent ?? "")?.[0]),
    ).toEqual(["Filter 1"]);
  });

  it("has no Set heading when nothing is set", () => {
    open([item(1)]);
    expect(screen.queryByText("Set")).toBeNull();
    expect(screen.getByText("Not set")).toBeInTheDocument();
  });

  it("finds a filter by its value as well as its name, and says when nothing matches", () => {
    open([...many(8), item(9, "Western EU")]);
    const box = screen.getByRole("searchbox", { name: "Find a filter" });
    fireEvent.change(box, { target: { value: "western" } });
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Filter 9");
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.getByText("No filter matches")).toBeInTheDocument();
  });

  it("truncates a long value and keeps its full text in the title", () => {
    open([item(1, "a very long value")]);
    expect(screen.getByText("a very long value")).toHaveAttribute(
      "title",
      "a very long value",
    );
  });

  it("keeps focus on the row after its × is pressed, since the row turns into Any", () => {
    open([item(1, "a"), item(2, "b")]);
    fireEvent.click(screen.getByRole("button", { name: "Clear Filter 2" }));
    expect(
      screen.getByRole("button", { name: /^Go to Filter 2 / }),
    ).toHaveFocus();
  });

  it("keeps focus on the row when clearing it moves it from Set to Not set", () => {
    const props = { onClear: vi.fn(), onClearAll: vi.fn() };
    const { rerender } = render(
      <FiltersButton items={[item(1, "a"), item(2, "b")]} {...props} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear Filter 1" }));
    // The app sorts set filters first, so the cleared row changes group.
    rerender(<FiltersButton items={[item(2, "b"), item(1)]} {...props} />);
    expect(
      screen.getByRole("button", { name: /^Go to Filter 1 / }),
    ).toHaveFocus();
  });

  it("names each row's jump button with its filter and where it sits", () => {
    open([item(1, "a")]);
    expect(
      screen.getByRole("button", { name: "Go to Filter 1 selector on Page 1" }),
    ).toBeInTheDocument();
  });

  it("hides the → from assistive tech", () => {
    open([item(1, "a")]);
    const jump = screen.getByRole("button", { name: /^Go to Filter 1 / });
    expect(
      jump.closest("li")!.querySelector("[data-filter-arrow]"),
    ).toHaveAttribute("aria-hidden", "true");
  });

  it("offers no switch when the app gave no handler", () => {
    open([item(1, "a")]);
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it.each([true, false])(
    "the Show filter bar switch reflects %s and toggles it",
    (shown) => {
      const onShowChange = vi.fn();
      render(
        <FiltersButton
          items={[item(1, "a")]}
          onClear={() => {}}
          onClearAll={() => {}}
          barShown={shown}
          onShowChange={onShowChange}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
      const sw = screen.getByRole("switch", { name: "Show filter bar" });
      expect(sw).toHaveAttribute("aria-checked", String(shown));
      fireEvent.click(sw);
      expect(onShowChange).toHaveBeenCalledWith(!shown);
    },
  );
});
