import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DataGridRowActions } from "../data-grid-row-actions";

describe("DataGridRowActions", () => {
  it("renders action trigger button", () => {
    render(
      <DataGridRowActions
        actions={[{ label: "Edit", onClick: vi.fn() }]}
      />
    );
    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
  });

  it("renders nothing when no actions", () => {
    const { container } = render(<DataGridRowActions actions={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
