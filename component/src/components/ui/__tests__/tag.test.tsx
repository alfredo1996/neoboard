import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Tag } from "../tag";

describe("Tag", () => {
  it("renders its label with no remove button by default", () => {
    render(<Tag>Shared</Tag>);
    expect(screen.getByText("Shared")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a remove button named after the label and calls onRemove", () => {
    const onRemove = vi.fn();
    render(<Tag onRemove={onRemove}>Sales</Tag>);
    fireEvent.click(screen.getByRole("button", { name: "Remove Sales" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
