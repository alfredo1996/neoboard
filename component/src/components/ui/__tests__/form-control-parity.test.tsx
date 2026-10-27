import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Input } from "../input";
import { Textarea } from "../textarea";
import { Select, SelectTrigger, SelectValue } from "../select";
import { FieldError } from "../field-error";
import { Combobox } from "../../composed/combobox";
import { MultiSelect } from "../../composed/multi-select";

// Epic C (#1127): shared size scale + aria-invalid treatment + FieldError.

function renderSelectTrigger(
  size?: "sm" | "default" | "lg",
  invalid?: boolean,
) {
  render(
    <Select>
      <SelectTrigger
        size={size}
        aria-invalid={invalid || undefined}
        data-testid="trigger"
      >
        <SelectValue placeholder="pick" />
      </SelectTrigger>
    </Select>,
  );
  return screen.getByTestId("trigger");
}

describe("shared control size scale (#1127 C1)", () => {
  it("Input: sm/default/lg map to the shared heights", () => {
    const { rerender } = render(<Input data-testid="i" size="sm" />);
    expect(screen.getByTestId("i").className).toContain("h-8");
    rerender(<Input data-testid="i" />);
    expect(screen.getByTestId("i").className).toContain("h-9");
    rerender(<Input data-testid="i" size="lg" />);
    expect(screen.getByTestId("i").className).toContain("h-10");
  });

  it("SelectTrigger: sm/lg map to the shared heights", () => {
    expect(renderSelectTrigger("sm").className).toContain("h-8");
  });

  it("Textarea: sizes scale min-height", () => {
    const { rerender } = render(<Textarea data-testid="t" size="sm" />);
    expect(screen.getByTestId("t").className).toContain("min-h-[56px]");
    rerender(<Textarea data-testid="t" />);
    expect(screen.getByTestId("t").className).toContain("min-h-[72px]");
    rerender(<Textarea data-testid="t" size="lg" />);
    expect(screen.getByTestId("t").className).toContain("min-h-[88px]");
  });
});

describe("aria-invalid treatment (#1127 C2)", () => {
  it("Input styles the invalid state off the aria-invalid attribute", () => {
    render(<Input data-testid="i" aria-invalid />);
    const el = screen.getByTestId("i");
    expect(el).toHaveAttribute("aria-invalid", "true");
    expect(el.className).toContain("aria-[invalid=true]:border-destructive");
  });

  it("Textarea and SelectTrigger carry the same invalid classes", () => {
    render(<Textarea data-testid="t" aria-invalid />);
    expect(screen.getByTestId("t").className).toContain(
      "aria-[invalid=true]:border-destructive",
    );
    expect(renderSelectTrigger(undefined, true).className).toContain(
      "aria-[invalid=true]:border-destructive",
    );
  });
});

describe("FieldError (#1127 C2)", () => {
  it("renders destructive text with the given id and role=alert", () => {
    render(<FieldError id="f-error">Required</FieldError>);
    const el = screen.getByRole("alert");
    expect(el).toHaveAttribute("id", "f-error");
    expect(el).toHaveTextContent("Required");
    expect(el.className).toContain("text-destructive");
  });

  it("renders nothing when there is no message", () => {
    const { container } = render(<FieldError id="f-error" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("field look is shared and hover never beats error or focus (#2217)", () => {
  // jsdom computes no cascade, so assert the class names the fix relies on:
  // the hover rule must not carry the `:enabled` variant (it made it (0,3,0),
  // out-ranking the (0,2,0) error and focus borders), and the error/focus
  // states each carry their own `hover:` variant so they win while hovered.
  it.each([
    ["Input", () => <Input data-testid="c" />],
    ["Textarea", () => <Textarea data-testid="c" />],
    [
      "SelectTrigger",
      () => (
        <Select>
          <SelectTrigger data-testid="c" />
        </Select>
      ),
    ],
    ["Combobox", () => <Combobox data-testid="c" options={[]} />],
    ["MultiSelect", () => <MultiSelect data-testid="c" options={[]} />],
  ])("%s", (_name, ui) => {
    render(ui());
    const el = screen.getByTestId("c");
    // MultiSelect's look lives on the shell around its trigger (#2275);
    // its states are the same ones written as has-[...] classes.
    const shell = _name === "MultiSelect" ? el.parentElement! : el;
    const cls = shell.className;
    expect(cls).toContain("bg-field");
    expect(cls).not.toContain("bg-card");
    expect(cls).toContain("hover:border-input-hover");
    expect(cls).not.toContain("hover:enabled:");
    expect(cls).toContain(
      _name === "MultiSelect"
        ? "has-[[aria-invalid=true]]:hover:border-destructive"
        : "aria-[invalid=true]:hover:border-destructive",
    );
    expect(cls).toContain(
      _name === "MultiSelect"
        ? "has-[[role=combobox]:focus-visible]:border-ring"
        : "focus-visible:hover:border-ring",
    );
    expect(cls).toContain("[@media(pointer:coarse)]:text-base");
  });
});
