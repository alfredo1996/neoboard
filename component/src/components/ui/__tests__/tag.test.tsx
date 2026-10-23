import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Tag, tagRemoveClass, tagRemoveGlyphClass } from "../tag";

describe("Tag", () => {
  it("renders its label with no remove button by default", () => {
    render(<Tag>Shared</Tag>);
    expect(screen.getByText("Shared")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a remove button named after the label and calls onRemove", () => {
    const onRemove = vi.fn();
    render(<Tag onRemove={onRemove}>Sales</Tag>);
    fireEvent.click(screen.getByRole("button", { name: "Remove Sales" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("is weight 400 so a Button around it does not make it medium", () => {
    render(<Tag>Shared</Tag>);
    expect(screen.getByText("Shared")).toHaveClass("font-normal");
  });

  it("names the remove button by removeLabel when the child is not text", () => {
    render(
      <Tag onRemove={() => {}} removeLabel="Remove Sales">
        <em>Sales</em>
      </Tag>,
    );
    expect(
      screen.getByRole("button", { name: "Remove Sales" }),
    ).toBeInTheDocument();
  });

  it("refuses a remove button that would be named just 'Remove'", () => {
    // Element children with no removeLabel: every chip would read "Remove".
    render(
      // @ts-expect-error removeLabel is required when children are not text
      <Tag onRemove={() => {}}>
        <em>Sales</em>
      </Tag>,
    );
    expect(screen.getByText("Sales")).toBeInTheDocument();
  });

  it("forces the remove glyph to 10px over a Button's svg size rule", () => {
    render(<Tag onRemove={() => {}}>Sales</Tag>);
    const glyph = screen.getByRole("button").querySelector("svg");
    expect(glyph).toHaveClass("!size-2.5");
    expect(tagRemoveGlyphClass).toContain("!size-2.5");
    expect(tagRemoveClass).toContain("text-muted-foreground");
  });
});
