import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { FilterBar } from "../filter-bar";
import type { FilterDef } from "../filter-bar";

const filters: FilterDef[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "status", label: "Status", type: "select", options: [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ]},
  { key: "email", label: "Email", type: "text" },
];

describe("FilterBar", () => {
  it("renders active filter chips", () => {
    render(
      <FilterBar
        filters={filters}
        values={{ name: "Alice" }}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Name:")).toBeInTheDocument();
  });

  it("renders add filter button when filters available", () => {
    render(
      <FilterBar filters={filters} values={{}} onChange={() => {}} />
    );
    expect(screen.getByText("Add filter")).toBeInTheDocument();
  });

  it("shows clear all button when filters are active and onClear is provided", () => {
    render(
      <FilterBar
        filters={filters}
        values={{ name: "Alice" }}
        onChange={() => {}}
        onClear={() => {}}
      />
    );
    expect(screen.getByText("Clear all")).toBeInTheDocument();
  });

  it("does not show clear all when no active filters", () => {
    render(
      <FilterBar
        filters={filters}
        values={{}}
        onChange={() => {}}
        onClear={() => {}}
      />
    );
    expect(screen.queryByText("Clear all")).not.toBeInTheDocument();
  });

  it("calls onClear when clear all is clicked", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <FilterBar
        filters={filters}
        values={{ name: "Alice" }}
        onChange={() => {}}
        onClear={onClear}
      />
    );
    await user.click(screen.getByText("Clear all"));
    expect(onClear).toHaveBeenCalled();
  });

  it("calls onChange when a filter is removed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterBar
        filters={filters}
        values={{ name: "Alice", email: "alice@test.com" }}
        onChange={onChange}
      />
    );
    // Find the remove button next to "Alice" text
    const aliceText = screen.getByText("Alice");
    const removeBtn = aliceText.parentElement!.querySelector("button")!;
    await user.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith({ email: "alice@test.com" });
  });

  it("renders select filter display value", () => {
    render(
      <FilterBar
        filters={filters}
        values={{ status: "active" }}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders multiple active filters", () => {
    render(
      <FilterBar
        filters={filters}
        values={{ name: "Alice", status: "active" }}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <FilterBar
        filters={filters}
        values={{}}
        onChange={() => {}}
        className="custom-bar"
      />
    );
    expect(container.firstChild).toHaveClass("custom-bar");
  });
});
