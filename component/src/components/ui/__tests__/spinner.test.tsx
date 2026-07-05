import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner } from "../spinner";

describe("Spinner (#1129 E1)", () => {
  it("renders a status role with an accessible label", () => {
    render(<Spinner />);
    const el = screen.getByRole("status");
    expect(el.getAttribute("aria-label")).toBe("Loading");
  });

  it("accepts a custom label", () => {
    render(<Spinner label="Saving" />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(
      "Saving",
    );
  });

  it.each([
    ["sm", "h-4"],
    ["default", "h-6"],
    ["lg", "h-8"],
  ] as const)("size %s applies the %s height", (size, cls) => {
    render(<Spinner size={size} label={`s-${size}`} />);
    expect(
      screen.getByRole("status", { name: `s-${size}` }).className,
    ).toContain(cls);
  });

  it("spins, with a reduced-motion opt-out", () => {
    render(<Spinner />);
    const cls = screen.getByRole("status").className;
    expect(cls).toContain("animate-spin");
    expect(cls).toContain("motion-reduce:animate-none");
  });

  it("draws a muted track with an accent arc (two-tone border)", () => {
    render(<Spinner />);
    const cls = screen.getByRole("status").className;
    expect(cls).toMatch(/border-muted-foreground/);
    expect(cls).toMatch(/border-t-\[hsl\(var\(--ring\)\)\]/);
  });

  it("merges custom classes", () => {
    render(<Spinner className="text-red-500" />);
    expect(screen.getByRole("status").className).toContain("text-red-500");
  });
});
