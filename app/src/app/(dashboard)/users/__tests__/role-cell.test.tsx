import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@neoboard/components", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="role-badge">{children}</span>
  ),
  Select: ({
    children,
    value,
    disabled,
  }: {
    children: React.ReactNode;
    value: string;
    disabled?: boolean;
  }) => (
    <div
      data-testid="role-select"
      data-value={value}
      data-disabled={!!disabled}
    >
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

import { RoleCell } from "../role-cell";

describe("RoleCell (#1038)", () => {
  it("renders a static Badge for non-admin viewers", () => {
    render(
      <RoleCell
        role="reader"
        isSelf={false}
        isAdmin={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("role-badge")).toHaveTextContent("reader");
    expect(screen.queryByTestId("role-select")).not.toBeInTheDocument();
  });

  it("renders an enabled Select for an admin viewing another user", () => {
    render(
      <RoleCell role="creator" isSelf={false} isAdmin onChange={vi.fn()} />,
    );
    const select = screen.getByTestId("role-select");
    expect(select).toHaveAttribute("data-value", "creator");
    expect(select).toHaveAttribute("data-disabled", "false");
  });

  it("renders a DISABLED Select (not a Badge) for the admin's own row", () => {
    render(<RoleCell role="admin" isSelf isAdmin onChange={vi.fn()} />);
    const select = screen.getByTestId("role-select");
    expect(select).toHaveAttribute("data-disabled", "true");
    // Self row is now a Select, consistent with other rows — never a Badge.
    expect(screen.queryByTestId("role-badge")).not.toBeInTheDocument();
    expect(
      screen.getByText("You cannot change your own role"),
    ).toBeInTheDocument();
  });
});
