import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  PropertyPanel,
  propertyRawText,
  type PropertyValue,
} from "../property-panel";

const one = (value: PropertyValue) =>
  render(<PropertyPanel items={[{ key: "k", value }]} />);

describe("PropertyPanel rows", () => {
  it("lists every key and value with no accordion, keys sorted A to Z", () => {
    render(
      <PropertyPanel
        items={[
          { key: "title", value: "The Matrix" },
          { key: "born", value: 1964 },
          { key: "Zed", value: "z" },
          { key: "alpha", value: "a" },
        ]}
      />,
    );
    const keys = screen
      .getAllByTestId("property-row")
      .map((r) => within(r).getByTestId("property-key").textContent);
    expect(keys).toEqual(["alpha", "born", "title", "Zed"]);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders the copy slot at the end of each row", () => {
    render(
      <PropertyPanel
        items={[{ key: "a", value: "1" }]}
        renderAction={(item) => <button>copy {item.key}</button>}
      />,
    );
    expect(
      within(screen.getByTestId("property-row")).getByRole("button", {
        name: "copy a",
      }),
    ).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <PropertyPanel items={[]} className="my-panel" />,
    );
    expect(container.firstChild).toHaveClass("my-panel");
  });
});

describe("PropertyPanel width rule", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  /** jsdom has no layout: row is `row` px wide, a sizer is 7px per character. */
  const layout = (row: number) => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(row);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return (this.dataset.text?.length ?? 0) * 7;
      },
    );
  };

  it("keeps a value that fits beside its key", () => {
    layout(300);
    one("The Matrix");
    expect(screen.getByTestId("property-row")).toHaveAttribute(
      "data-wide",
      "false",
    );
  });

  it("moves a value that does not fit under its key", () => {
    layout(300);
    one("A very long tagline that cannot fit");
    expect(screen.getByTestId("property-row")).toHaveAttribute(
      "data-wide",
      "true",
    );
  });

  it("decides by the panel's width, not by the text's length", () => {
    layout(600);
    one("A very long tagline that cannot fit");
    expect(screen.getByTestId("property-row")).toHaveAttribute(
      "data-wide",
      "false",
    );
  });

  it("keeps a short list or map beside its key", () => {
    layout(600);
    const { unmount } = one(["a", "b"]);
    expect(screen.getByTestId("property-row")).toHaveAttribute(
      "data-wide",
      "false",
    );
    unmount();
    one({ a: 1 });
    expect(screen.getByTestId("property-row")).toHaveAttribute(
      "data-wide",
      "false",
    );
  });

  it("moves a list or map that does not fit under its key", () => {
    layout(300);
    const { unmount } = one(["alpha", "beta", "gamma", "delta", "epsilon"]);
    expect(screen.getByTestId("property-row")).toHaveAttribute(
      "data-wide",
      "true",
    );
    unmount();
    one({ first: "alpha", second: "beta", third: "gamma" });
    expect(screen.getByTestId("property-row")).toHaveAttribute(
      "data-wide",
      "true",
    );
  });

  it("clips the hidden sizer so a long value cannot widen the panel", () => {
    layout(300);
    one("x".repeat(500));
    const sizer = document.querySelector("[data-text]") as HTMLElement;
    expect(sizer.parentElement).toHaveClass("overflow-hidden");
  });
});

describe("PropertyPanel values (#2349)", () => {
  it("shows a list as separate items, collapsed after 5, expandable", async () => {
    const user = userEvent.setup();
    one(["a", "b", "c", "d", "e", "f", "g"]);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "+2 more" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    await user.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("offers no expander for a list of 5 or fewer", () => {
    one(["a", "b", "c", "d", "e"]);
    expect(screen.queryByRole("button", { name: /more|Show/ })).toBeNull();
  });

  it.each<[string, PropertyValue, string]>([
    ["string", "Alice", "Alice"],
    ["number", 42, "42"],
    ["a year stays bare", 1964, "1964"],
    ["four digits stay bare", 9999, "9999"],
    ["five digits are grouped", 10000, "10,000"],
    ["a large number is grouped", 63000000, "63,000,000"],
    ["a negative large number", -12345, "-12,345"],
    ["negative float", -1.5, "-1.5"],
    ["boolean true", true, "true"],
    ["boolean false", false, "false"],
    ["null", null, "null"],
    ["undefined", undefined, "-"],
    ["date", "2024-01-15", "2024-01-15"],
    ["date-time", "2024-01-15T10:30:00Z", "2024-01-15T10:30:00Z"],
    ["duration", "P1DT2H", "P1DT2H"],
    ["point", { srid: 4326, x: 1.5, y: 2.5 }, "srid: 4326x: 1.5y: 2.5"],
    ["nested map", { a: { b: "c" } }, "a: b: c"],
    ["nested list", [["x", "y"], ["z"]], "xyz"],
    ["empty list", [], "(empty list)"],
    ["empty map", {}, "(empty map)"],
    ["empty string", "", "(empty)"],
    ["driver integer past a double", "9007199254740993", "9007199254740993"],
    ["string at the clamp threshold", "y".repeat(200), "y".repeat(200)],
  ])("renders %s", (_name, value, text) => {
    one(value);
    expect(screen.getByTestId("property-value").textContent).toBe(text);
  });

  it("collapses a map past 5 entries and renders only the visible ones", async () => {
    const user = userEvent.setup();
    const big = Object.fromEntries(
      Array.from({ length: 2000 }, (_, i) => [String(i), i]),
    );
    one(big);
    const rows = () =>
      screen
        .getByTestId("property-value")
        .querySelectorAll(":scope > div > div");
    expect(rows()).toHaveLength(5);
    const more = screen.getByRole("button", { name: "+1995 more" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);
    expect(rows()).toHaveLength(2000);
  });

  it("keeps duplicate list items", () => {
    one(["a", "a", "a"]);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("clamps a 1000-char string behind a Show more toggle", async () => {
    const user = userEvent.setup();
    one("y".repeat(1000));
    const text = screen.getByTestId("property-text");
    expect(text.className).toContain("line-clamp-4");
    const toggle = screen.getByRole("button", { name: "Show more" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(text.className).not.toContain("line-clamp-4");
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("offers no toggle on a 60-char string", () => {
    one("y".repeat(60));
    expect(screen.queryByRole("button", { name: /more|Show/ })).toBeNull();
  });
});

describe("propertyRawText", () => {
  it.each<[string, PropertyValue, string]>([
    ["a string as is", "x", "x"],
    ["a number ungrouped", 63000000, "63000000"],
    ["a boolean", false, "false"],
    ["null", null, "null"],
    ["a list as JSON", ["a", 1], '["a",1]'],
    ["a map as JSON", { a: { b: 1 } }, '{"a":{"b":1}}'],
    ["an empty string as empty", "", ""],
  ])("%s", (_n, value, text) => {
    expect(propertyRawText(value)).toBe(text);
  });
});
