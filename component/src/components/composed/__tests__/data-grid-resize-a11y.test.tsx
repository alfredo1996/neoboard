import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { DataGrid } from "../data-grid";
import type { ColumnDef } from "@tanstack/react-table";

/**
 * #1283 item 3 — the column resize handle was a bare <div> with only pointer
 * handlers: no role, no tab stop, no key handler, and `resetSize()` bound to
 * double-click alone. A keyboard user could neither widen a truncated column
 * nor reset one.
 */

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

interface Row {
  name: string;
  email: string;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
];

const data: Row[] = [{ name: "Alice", email: "alice@example.com" }];

function widthOf(label: string): number {
  const th = screen.getByRole("columnheader", { name: new RegExp(label) });
  return parseFloat((th as HTMLElement).style.width);
}

describe("#1283 item 3 — resize handle is keyboard-operable", () => {
  it("exposes a labelled button per resizable column", () => {
    render(<DataGrid columns={columns} data={data} enableColumnResizing />);
    expect(
      screen.getByRole("button", { name: /Resize Name/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Resize Email/i }),
    ).toBeInTheDocument();
  });

  it("renders no resize control when resizing is off", () => {
    render(<DataGrid columns={columns} data={data} />);
    expect(screen.queryByRole("button", { name: /Resize/i })).toBeNull();
  });

  it("widens with ArrowRight and narrows with ArrowLeft", async () => {
    const user = userEvent.setup();
    render(<DataGrid columns={columns} data={data} enableColumnResizing />);

    const before = widthOf("Name");
    const handle = screen.getByRole("button", { name: /Resize Name/i });
    handle.focus();

    await user.keyboard("{ArrowRight}");
    const wider = widthOf("Name");
    expect(wider).toBeGreaterThan(before);

    await user.keyboard("{ArrowLeft}");
    expect(widthOf("Name")).toBeLessThan(wider);
  });

  it("restores the default width with Home", async () => {
    const user = userEvent.setup();
    render(<DataGrid columns={columns} data={data} enableColumnResizing />);

    const original = widthOf("Name");
    const handle = screen.getByRole("button", { name: /Resize Name/i });
    handle.focus();

    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(widthOf("Name")).toBeGreaterThan(original);

    await user.keyboard("{Home}");
    expect(widthOf("Name")).toBe(original);
  });

  it("becomes visible on focus, not only on hover", () => {
    render(<DataGrid columns={columns} data={data} enableColumnResizing />);
    // opacity-0 with no focus counterpart means a keyboard user cannot see
    // where they are.
    expect(
      screen.getByRole("button", { name: /Resize Name/i }).className,
    ).toContain("focus-visible:opacity-100");
  });
});
