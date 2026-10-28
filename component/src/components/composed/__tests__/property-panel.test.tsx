import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { PropertyPanel, type PropertyValue } from "../property-panel";

const sections = [
  {
    title: "Node Properties",
    items: [
      { key: "name", value: "Alice" },
      { key: "age", value: "30" },
    ],
  },
  {
    title: "Metadata",
    items: [{ key: "created", value: "2024-01-01" }],
  },
];

describe("PropertyPanel", () => {
  it("renders section titles", () => {
    render(<PropertyPanel sections={sections} />);
    expect(screen.getByText("Node Properties")).toBeInTheDocument();
    expect(screen.getByText("Metadata")).toBeInTheDocument();
  });

  it("renders property keys and values", () => {
    render(<PropertyPanel sections={sections} />);
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("age")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("renders item count in collapsible sections", () => {
    render(<PropertyPanel sections={sections} />);
    expect(screen.getByText("(2)")).toBeInTheDocument();
    expect(screen.getByText("(1)")).toBeInTheDocument();
  });

  it("shows edit buttons when editable is true", () => {
    render(<PropertyPanel sections={sections} editable />);
    expect(screen.getByLabelText("Edit name")).toBeInTheDocument();
    expect(screen.getByLabelText("Edit age")).toBeInTheDocument();
  });

  it("does not show edit buttons when editable is false", () => {
    render(<PropertyPanel sections={sections} />);
    expect(screen.queryByLabelText("Edit name")).not.toBeInTheDocument();
  });

  it("enters edit mode on edit button click", async () => {
    const user = userEvent.setup();
    render(<PropertyPanel sections={sections} editable />);
    await user.click(screen.getByLabelText("Edit name"));
    expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
  });

  it("saves edited value", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<PropertyPanel sections={sections} editable onEdit={onEdit} />);
    await user.click(screen.getByLabelText("Edit name"));
    const input = screen.getByDisplayValue("Alice");
    await user.clear(input);
    await user.type(input, "Bob");
    await user.click(screen.getByLabelText("Save"));
    expect(onEdit).toHaveBeenCalledWith("Node Properties", "name", "Bob");
  });

  it("cancels editing", async () => {
    const user = userEvent.setup();
    render(<PropertyPanel sections={sections} editable />);
    await user.click(screen.getByLabelText("Edit name"));
    await user.click(screen.getByLabelText("Cancel"));
    expect(screen.queryByDisplayValue("Alice")).not.toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("renders non-collapsible sections as simple divs", () => {
    const nonCollapsible = [
      {
        title: "Info",
        items: [{ key: "id", value: "123" }],
        collapsible: false,
      },
    ];
    render(<PropertyPanel sections={nonCollapsible} />);
    expect(screen.getByText("Info")).toBeInTheDocument();
    expect(screen.getByText("123")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <PropertyPanel sections={sections} className="my-panel" />,
    );
    expect(container.firstChild).toHaveClass("my-panel");
  });
});

describe("PropertyPanel values (#2349)", () => {
  const one = (value: PropertyValue) =>
    render(
      <PropertyPanel
        sections={[{ title: "S", items: [{ key: "k", value }] }]}
      />,
    );

  it("keeps the key visible and shrink-proof beside a 200-character value", () => {
    one("x".repeat(200));
    const key = screen.getByText("k");
    expect(key).toBeVisible();
    expect(key.className).toContain("shrink-0");
    expect(screen.getByTestId("property-value").className).toContain("min-w-0");
  });

  it("shows a list as separate items, collapsed after 5, expandable", async () => {
    const user = userEvent.setup();
    one(["a", "b", "c", "d", "e", "f", "g"]);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "Show 2 more items" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    await user.click(screen.getByRole("button", { name: "Show fewer items" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("offers no expander for a list of 5 or fewer", () => {
    one(["a", "b", "c", "d", "e"]);
    expect(screen.queryByRole("button", { name: /items$/ })).toBeNull();
  });

  it.each<[string, PropertyValue, string]>([
    ["string", "Alice", "Alice"],
    ["number", 42, "42"],
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
    ["very long string", "y".repeat(500), "y".repeat(500)],
  ])("renders %s", (_name, value, text) => {
    one(value);
    expect(screen.getByTestId("property-value").textContent).toBe(text);
  });

  it("still edits a string value in place", async () => {
    const user = userEvent.setup();
    render(
      <PropertyPanel
        editable
        sections={[{ title: "S", items: [{ key: "k", value: "v" }] }]}
      />,
    );
    await user.click(screen.getByLabelText("Edit k"));
    expect(screen.getByDisplayValue("v")).toBeInTheDocument();
  });

  it("offers no edit on a list value", () => {
    render(
      <PropertyPanel
        editable
        sections={[{ title: "S", items: [{ key: "k", value: ["a"] }] }]}
      />,
    );
    expect(screen.queryByLabelText("Edit k")).toBeNull();
  });
});
