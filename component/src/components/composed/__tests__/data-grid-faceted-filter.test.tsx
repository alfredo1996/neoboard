import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DataGridFacetedFilter } from "../data-grid-faceted-filter";

describe("DataGridFacetedFilter", () => {
  const options = [
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
    { label: "Pending", value: "pending" },
  ];

  it("renders the trigger button with title", () => {
    render(<DataGridFacetedFilter title="Status" options={options} />);
    expect(screen.getByRole("button", { name: /Status/ })).toBeInTheDocument();
  });

  it("renders without title", () => {
    render(<DataGridFacetedFilter options={options} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders with empty options", () => {
    render(<DataGridFacetedFilter title="Filter" options={[]} />);
    expect(screen.getByRole("button", { name: /Filter/ })).toBeInTheDocument();
  });

  it("renders plus icon", () => {
    const { container } = render(
      <DataGridFacetedFilter title="Status" options={options} />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
