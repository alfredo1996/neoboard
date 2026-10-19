import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar, AvatarFallback, AvatarImage } from "../avatar";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../pagination";
import { Toaster } from "../toaster";

/**
 * Render coverage for primitives that had none (#1130) — exercises the
 * component trees end to end (Avatar fallback path, Pagination active/nav
 * links and the Toaster mount point).
 */

describe("Avatar", () => {
  it("renders the fallback when no image loads", () => {
    render(
      <Avatar data-testid="av">
        <AvatarImage src="/nope.png" alt="Alice" />
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>,
    );
    // jsdom never loads images, so the fallback path renders.
    expect(screen.getByText("AL")).toBeDefined();
    expect(screen.getByTestId("av").className).toContain("rounded-full");
  });
});

describe("Pagination", () => {
  it("renders nav semantics with active page and prev/next", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#p" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#1" isActive>
              1
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#n" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );
    expect(
      screen.getByRole("navigation", { name: /pagination/i }),
    ).toBeDefined();
    const active = screen.getByRole("link", { name: "1" });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /previous/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /next/i })).toBeDefined();
  });
});

describe("Toaster", () => {
  it("mounts the toast viewport region", () => {
    render(<Toaster />);
    expect(screen.getByRole("region")).toBeDefined();
  });
});

// Silence the jsdom "not implemented" noise some Radix internals emit.
vi.stubGlobal("scrollTo", vi.fn());
