import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FieldPicker } from "../field-picker";

const fields = [
  { name: "name", type: "string" as const },
  { name: "age", type: "number" as const },
  { name: "createdAt", type: "date" as const },
];

describe("FieldPicker", () => {
  it("renders all fields", () => {
    render(<FieldPicker fields={fields} />);
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("age")).toBeInTheDocument();
    expect(screen.getByText("createdAt")).toBeInTheDocument();
  });

  it("renders type badges", () => {
    render(<FieldPicker fields={fields} />);
    expect(screen.getByText("string")).toBeInTheDocument();
    expect(screen.getByText("number")).toBeInTheDocument();
    expect(screen.getByText("date")).toBeInTheDocument();
  });

  it("calls onSelect when unselected field is clicked", () => {
    const onSelect = vi.fn();
    render(<FieldPicker fields={fields} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("name"));
    expect(onSelect).toHaveBeenCalledWith("name");
  });

  it("calls onRemove when selected field is clicked", () => {
    const onRemove = vi.fn();
    render(
      <FieldPicker fields={fields} selected={["name"]} onRemove={onRemove} />
    );
    fireEvent.click(screen.getByText("name"));
    expect(onRemove).toHaveBeenCalledWith("name");
  });

  it("shows empty state when no fields", () => {
    render(<FieldPicker fields={[]} />);
    expect(screen.getByText("No fields available")).toBeInTheDocument();
  });

  it("highlights selected fields", () => {
    const { container } = render(
      <FieldPicker fields={fields} selected={["age"]} />
    );
    const selectedButtons = container.querySelectorAll(".bg-accent");
    expect(selectedButtons.length).toBeGreaterThanOrEqual(1);
  });
});
