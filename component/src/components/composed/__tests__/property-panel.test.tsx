import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { PropertyPanel } from "../property-panel";

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
    items: [
      { key: "created", value: "2024-01-01" },
    ],
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
      { title: "Info", items: [{ key: "id", value: "123" }], collapsible: false },
    ];
    render(<PropertyPanel sections={nonCollapsible} />);
    expect(screen.getByText("Info")).toBeInTheDocument();
    expect(screen.getByText("123")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <PropertyPanel sections={sections} className="my-panel" />
    );
    expect(container.firstChild).toHaveClass("my-panel");
  });
});
