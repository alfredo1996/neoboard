import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "../badge";

describe("Badge", () => {
  it("renders default variant (graphite primary fill)", () => {
    render(<Badge>Default</Badge>);
    expect(screen.getByText("Default")).toHaveClass("bg-primary");
  });

  it("renders the citrine tonal variant as an alpha --ring tint", () => {
    render(<Badge variant="tonal">Featured</Badge>);
    const badge = screen.getByText("Featured");
    expect(badge).toHaveClass("bg-[hsl(var(--ring)/0.14)]");
    expect(badge).toHaveClass("text-accent-foreground");
  });

  it("renders a success variant as a tonal success tint, not the heavy default", () => {
    render(<Badge variant="success">Connected</Badge>);
    const badge = screen.getByText("Connected");
    // Tonal tint sourced from the --success token (tracks theme), with the
    // token color as text — never the solid bg-primary default.
    expect(badge).toHaveClass("bg-[hsl(var(--success)/0.15)]");
    expect(badge).toHaveClass("text-[hsl(var(--success))]");
    expect(badge).not.toHaveClass("bg-primary");
  });

  it("renders a warning variant as a tonal warning tint", () => {
    render(<Badge variant="warning">Connecting</Badge>);
    const badge = screen.getByText("Connecting");
    expect(badge).toHaveClass("bg-[hsl(var(--warning)/0.15)]");
    expect(badge).toHaveClass("text-[hsl(var(--warning))]");
  });
});
