import { describe, it, expect, vi } from "vitest";
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../form";
import { Input } from "../input";

/**
 * Render coverage for primitives that had none (#1130) — exercises the
 * component trees end to end (Avatar fallback path, Pagination active/nav
 * links, the Toaster mount point, and the react-hook-form Form wiring
 * including FormMessage error rendering).
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

describe("Form", () => {
  function Demo({ error }: { error?: boolean }) {
    const form = useForm<{ name: string }>({ defaultValues: { name: "" } });
    useEffect(() => {
      if (error) form.setError("name", { message: "Name is required" });
    }, [error, form]);
    return (
      <Form {...form}>
        <form>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormDescription>Shown on your profile.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    );
  }

  it("wires label, control, and description ids together", () => {
    render(<Demo />);
    const input = screen.getByLabelText("Name");
    expect(input.getAttribute("aria-describedby")).toContain(
      "form-item-description",
    );
    expect(input.getAttribute("aria-invalid")).toBe("false");
  });

  it("renders the field error through FormMessage and flips aria-invalid", () => {
    render(<Demo error />);
    expect(screen.getByText("Name is required")).toBeDefined();
    expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe(
      "true",
    );
  });
});

// Silence the jsdom "not implemented" noise some Radix internals emit.
vi.stubGlobal("scrollTo", vi.fn());
