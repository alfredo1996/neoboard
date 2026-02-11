import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { GraphLegend } from "../graph-legend";

const items = [
  { label: "Person", color: "#3b82f6", count: 42 },
  { label: "Movie", color: "#ef4444", count: 18 },
  { label: "Director", color: "#22c55e", count: 7 },
];

describe("GraphLegend", () => {
  it("renders all legend items", () => {
    render(<GraphLegend items={items} />);
    expect(screen.getByText("Person")).toBeInTheDocument();
    expect(screen.getByText("Movie")).toBeInTheDocument();
    expect(screen.getByText("Director")).toBeInTheDocument();
  });

  it("renders counts", () => {
    render(<GraphLegend items={items} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("calls onToggle when item is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<GraphLegend items={items} onToggle={onToggle} />);
    await user.click(screen.getByText("Person"));
    expect(onToggle).toHaveBeenCalledWith("Person", false);
  });

  it("toggles hidden items to visible", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const itemsWithHidden = [
      { ...items[0], visible: false },
      ...items.slice(1),
    ];
    render(<GraphLegend items={itemsWithHidden} onToggle={onToggle} />);
    await user.click(screen.getByText("Person"));
    expect(onToggle).toHaveBeenCalledWith("Person", true);
  });

  it("disables buttons when no onToggle", () => {
    render(<GraphLegend items={items} />);
    const buttons = screen.getAllByRole("listitem");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it("renders horizontal orientation", () => {
    const { container } = render(<GraphLegend items={items} orientation="horizontal" />);
    expect(container.firstChild).toHaveClass("flex-row");
  });

  it("renders vertical orientation by default", () => {
    const { container } = render(<GraphLegend items={items} />);
    expect(container.firstChild).toHaveClass("flex-col");
  });

  it("renders without counts", () => {
    const itemsNoCount = items.map(({ count: _, ...rest }) => rest);
    render(<GraphLegend items={itemsNoCount} />);
    expect(screen.queryByText("42")).not.toBeInTheDocument();
  });

  it("has accessible list role", () => {
    render(<GraphLegend items={items} />);
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<GraphLegend items={items} className="my-legend" />);
    expect(container.firstChild).toHaveClass("my-legend");
  });
});
