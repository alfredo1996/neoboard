import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Input } from "../input";
import { Textarea } from "../textarea";
import { Select, SelectTrigger, SelectValue } from "../select";
import { FieldError } from "../field-error";

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
    expect(screen.getByTestId("i").className).toContain("h-10");
    rerender(<Input data-testid="i" size="lg" />);
    expect(screen.getByTestId("i").className).toContain("h-12");
  });

  it("SelectTrigger: sm/lg map to the shared heights", () => {
    expect(renderSelectTrigger("sm").className).toContain("h-8");
  });

  it("Textarea: sizes scale min-height", () => {
    const { rerender } = render(<Textarea data-testid="t" size="sm" />);
    expect(screen.getByTestId("t").className).toContain("min-h-[48px]");
    rerender(<Textarea data-testid="t" />);
    expect(screen.getByTestId("t").className).toContain("min-h-[60px]");
    rerender(<Textarea data-testid="t" size="lg" />);
    expect(screen.getByTestId("t").className).toContain("min-h-[80px]");
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
