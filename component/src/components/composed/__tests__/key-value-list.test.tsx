import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { KeyValueList } from "../key-value-list";

const items = [
  { key: "Name", value: "John" },
  { key: "Email", value: "john@example.com" },
  { key: "Role", value: "Admin" },
];

describe("KeyValueList", () => {
  it("renders all items in vertical orientation", () => {
    render(<KeyValueList items={items} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("John")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
  });

  it("uses dl/dt/dd in vertical orientation", () => {
    const { container } = render(<KeyValueList items={items} />);
    expect(container.querySelector("dl")).toBeInTheDocument();
    expect(container.querySelectorAll("dt")).toHaveLength(3);
    expect(container.querySelectorAll("dd")).toHaveLength(3);
  });

  it("renders horizontal orientation", () => {
    render(<KeyValueList items={items} orientation="horizontal" />);
    expect(screen.getByText(/Name:/)).toBeInTheDocument();
    expect(screen.getByText("John")).toBeInTheDocument();
  });

  it("does not use dl in horizontal orientation", () => {
    const { container } = render(<KeyValueList items={items} orientation="horizontal" />);
    expect(container.querySelector("dl")).not.toBeInTheDocument();
  });

  it("renders ReactNode values", () => {
    const richItems = [{ key: "Status", value: <span data-testid="badge">Active</span> }];
    render(<KeyValueList items={richItems} />);
    expect(screen.getByTestId("badge")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<KeyValueList items={items} className="my-list" />);
    expect(container.firstChild).toHaveClass("my-list");
  });
});
