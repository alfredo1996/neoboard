import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DataSourcePicker } from "../data-source-picker";

const options = [
  { id: "ds1", name: "Production DB", type: "Neo4j" },
  { id: "ds2", name: "Staging DB", type: "PostgreSQL" },
  { id: "ds3", name: "Local DB" },
];

describe("DataSourcePicker", () => {
  it("renders trigger with placeholder", () => {
    render(<DataSourcePicker options={options} />);
    expect(screen.getByText("Select data source")).toBeInTheDocument();
  });

  it("renders custom placeholder", () => {
    render(<DataSourcePicker options={options} placeholder="Pick a source" />);
    expect(screen.getByText("Pick a source")).toBeInTheDocument();
  });

  it("renders database icon", () => {
    const { container } = render(<DataSourcePicker options={options} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("shows options when clicked", () => {
    render(<DataSourcePicker options={options} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByText("Production DB")).toBeInTheDocument();
    expect(screen.getByText("Staging DB")).toBeInTheDocument();
    expect(screen.getByText("Local DB")).toBeInTheDocument();
  });

  it("shows type annotation for options with type", () => {
    render(<DataSourcePicker options={options} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByText("(Neo4j)")).toBeInTheDocument();
    expect(screen.getByText("(PostgreSQL)")).toBeInTheDocument();
  });

  it("calls onValueChange when option selected", () => {
    const onValueChange = vi.fn();
    render(<DataSourcePicker options={options} onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Production DB"));
    expect(onValueChange).toHaveBeenCalledWith("ds1");
  });

  it("shows empty state when no options", () => {
    render(<DataSourcePicker options={[]} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByText("No data sources")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<DataSourcePicker options={options} className="w-full" />);
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveClass("w-full");
  });
});
