import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AvatarGroup } from "../avatar-group";

const items = [
  { name: "Alice Smith" },
  { name: "Bob Jones" },
  { name: "Charlie Brown" },
  { name: "Diana Prince" },
  { name: "Eve Adams" },
];

describe("AvatarGroup", () => {
  it("renders avatars with initials", () => {
    render(<AvatarGroup items={[{ name: "Alice Smith" }]} max={5} />);
    expect(screen.getByText("AS")).toBeInTheDocument();
  });

  it("generates correct initials from single name", () => {
    render(<AvatarGroup items={[{ name: "Alice" }]} max={5} />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("generates two-letter initials from multi-word names", () => {
    render(<AvatarGroup items={[{ name: "John Doe" }]} max={5} />);
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("limits initials to 2 characters for three-word names", () => {
    render(<AvatarGroup items={[{ name: "Mary Jane Watson" }]} max={5} />);
    expect(screen.getByText("MJ")).toBeInTheDocument();
  });

  it("uses custom fallback when provided", () => {
    render(
      <AvatarGroup
        items={[{ name: "Alice Smith", fallback: "XY" }]}
        max={5}
      />
    );
    expect(screen.getByText("XY")).toBeInTheDocument();
  });

  it("limits visible avatars to max prop", () => {
    render(<AvatarGroup items={items} max={3} />);
    expect(screen.getByText("AS")).toBeInTheDocument();
    expect(screen.getByText("BJ")).toBeInTheDocument();
    expect(screen.getByText("CB")).toBeInTheDocument();
    // Diana and Eve should not be visible
    expect(screen.queryByText("DP")).not.toBeInTheDocument();
    expect(screen.queryByText("EA")).not.toBeInTheDocument();
  });

  it("shows overflow counter when items exceed max", () => {
    render(<AvatarGroup items={items} max={3} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("does not show overflow counter when all items fit", () => {
    render(<AvatarGroup items={items.slice(0, 3)} max={3} />);
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("does not show overflow when items equal max", () => {
    render(<AvatarGroup items={items.slice(0, 4)} max={4} />);
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("shows +1 overflow for one extra item", () => {
    render(<AvatarGroup items={items.slice(0, 3)} max={2} />);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("defaults max to 4", () => {
    render(<AvatarGroup items={items} />);
    // Should show 4 avatars + overflow
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});
