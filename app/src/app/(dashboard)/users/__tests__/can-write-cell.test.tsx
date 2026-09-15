import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@neoboard/components", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Switch: ({ checked, disabled }: { checked: boolean; disabled?: boolean }) => (
    <button
      type="button"
      data-testid="write-switch"
      aria-checked={checked}
      disabled={disabled}
    />
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

import { CanWriteCell } from "../can-write-cell";

describe("CanWriteCell", () => {
  it.each([
    ["an admin, whatever is stored", "admin", false, "Yes"],
    ["a reader, whatever is stored", "reader", true, "No"],
    ["a creator allowed to write", "creator", true, "Yes"],
    ["a creator not allowed to write", "creator", false, "No"],
  ] as const)(
    "shows a non-admin whether %s can write",
    (_, role, canWrite, shown) => {
      render(
        <CanWriteCell
          id="u2"
          role={role}
          canWrite={canWrite}
          isSelf={false}
          isAdmin={false}
          onToggle={vi.fn()}
        />,
      );

      expect(screen.getByText(shown)).toBeInTheDocument();
    },
  );

  it("tells an admin that a reader's write permission is about their own write queries, not forms (#1831)", () => {
    render(
      <CanWriteCell
        id="u2"
        role="reader"
        canWrite={false}
        isSelf={false}
        isAdmin
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByTestId("write-switch")).toBeDisabled();
    expect(
      screen.getByText(
        "Readers cannot run their own write queries, but they can still submit forms",
      ),
    ).toBeInTheDocument();
  });
});
