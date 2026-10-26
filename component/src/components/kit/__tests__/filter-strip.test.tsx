import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { FilterStrip } from "../filter-strip";

const filters = [
  { id: "decade", label: "Decade", value: "1990s" },
  { id: "actor", label: "Actor", value: "Tom Hanks" },
];

function renderStrip(over: object = {}) {
  const props = { onRemove: vi.fn(), onClearAll: vi.fn(), ...over };
  render(<FilterStrip filters={filters} {...props} />);
  return props;
}

function stubSizes(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(
    scrollWidth,
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
    clientWidth,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("FilterStrip", () => {
  it("renders nothing while no filter is set", () => {
    const { container } = render(
      <FilterStrip filters={[]} onRemove={() => {}} onClearAll={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("words a chip 'Name: value' with a named remove button", () => {
    renderStrip();
    expect(screen.getAllByRole("listitem")[0].textContent).toBe(
      "Decade: 1990s",
    );
    expect(
      screen.getByRole("button", { name: "Remove Decade filter" }),
    ).toBeInTheDocument();
  });

  it("cuts a value over 24 characters with an ellipsis and keeps the full text on the chip title", () => {
    const long = "A".repeat(30);
    render(
      <FilterStrip
        filters={[{ id: "x", label: "Title", value: long }]}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByRole("listitem").textContent).toBe(
      `Title: ${"A".repeat(24)}…`,
    );
    expect(screen.getByTitle(`Title: ${long}`)).toBeInTheDocument();
  });

  it("does not cut a value of exactly 24 characters", () => {
    const v = "B".repeat(24);
    render(
      <FilterStrip
        filters={[{ id: "x", label: "T", value: v }]}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByRole("listitem").textContent).toBe(`T: ${v}`);
  });

  it("stays one line: the chips scroll sideways and never wrap", () => {
    renderStrip();
    const tokens = screen.getByRole("list").className.split(/\s+/);
    expect(tokens).toContain("overflow-x-auto");
    expect(tokens).toContain("flex-nowrap");
    expect(tokens).not.toContain("flex-wrap");
  });

  it("removes one filter by id and clears all", () => {
    const { onRemove, onClearAll } = renderStrip();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Actor filter" }),
    );
    expect(onRemove).toHaveBeenCalledWith("actor");
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onClearAll).toHaveBeenCalledOnce();
  });

  it("selects from the chip text", () => {
    const onSelect = vi.fn();
    render(
      <FilterStrip
        filters={[{ ...filters[0], onSelect }]}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Decade: 1990s" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("shows no arrows when everything fits", () => {
    stubSizes(300, 300);
    renderStrip();
    expect(screen.queryByLabelText("More filters")).toBeNull();
    expect(screen.queryByLabelText("Earlier filters")).toBeNull();
  });

  it("shows only the forward arrow at the start of an overflowing strip, then the back one once scrolled", () => {
    stubSizes(900, 300);
    renderStrip();
    expect(screen.getByLabelText("More filters")).toBeInTheDocument();
    expect(screen.queryByLabelText("Earlier filters")).toBeNull();
    const list = screen.getByRole("list");
    act(() => {
      list.scrollLeft = 200;
      fireEvent.scroll(list);
    });
    expect(screen.getByLabelText("Earlier filters")).toBeInTheDocument();
    act(() => {
      list.scrollLeft = 600;
      fireEvent.scroll(list);
    });
    expect(screen.queryByLabelText("More filters")).toBeNull();
  });

  it("scrolls by most of a view when an arrow is pressed", () => {
    stubSizes(900, 300);
    renderStrip();
    const by = vi.fn();
    screen.getByRole("list").scrollBy = by;
    fireEvent.click(screen.getByLabelText("More filters"));
    expect(by).toHaveBeenCalledWith({ left: 240, behavior: "smooth" });
  });

  it("keeps the arrows out of the tab order and the accessibility tree: Tab already reaches every chip", () => {
    stubSizes(900, 300);
    renderStrip();
    const more = screen.getByLabelText("More filters");
    expect(more).toHaveAttribute("tabindex", "-1");
    expect(more).toHaveAttribute("aria-hidden", "true");
  });

  it("moves focus to the next chip when one is removed, so keyboard focus is not lost", () => {
    renderStrip();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Decade filter" }),
    );
    expect(
      screen.getByRole("button", { name: "Remove Actor filter" }),
    ).toHaveFocus();
  });

  it("mutes the name in a chip", () => {
    renderStrip();
    expect(screen.getByText("Decade:")).toHaveClass("text-muted-foreground");
  });
});
