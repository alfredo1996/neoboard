import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "../button";

// Epic B (#1126): Button joins the canonical variant vocabulary —
// success/warning added as solid semantic actions (like destructive).
describe("Button semantic variants (#1126)", () => {
  it("renders a success variant as a solid --success action", () => {
    render(<Button variant="success">Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.className).toContain("bg-[hsl(var(--success))]");
    expect(btn.className).toContain("text-[hsl(var(--success-foreground))]");
  });

  it("renders a warning variant as a solid --warning action", () => {
    render(<Button variant="warning">Proceed</Button>);
    const btn = screen.getByRole("button", { name: "Proceed" });
    expect(btn.className).toContain("bg-[hsl(var(--warning))]");
    expect(btn.className).toContain("text-[hsl(var(--warning-foreground))]");
  });
});
