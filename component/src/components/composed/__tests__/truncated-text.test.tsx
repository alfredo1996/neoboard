import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TruncatedText } from "../truncated-text";

describe("TruncatedText", () => {
  it("renders full text when under maxLength", () => {
    render(<TruncatedText text="Short text" maxLength={50} />);
    expect(screen.getByText("Short text")).toBeInTheDocument();
  });

  it("truncates text with ellipsis when exceeding maxLength", () => {
    render(<TruncatedText text="This is a very long text" maxLength={10} />);
    expect(screen.getByText("This is a ...")).toBeInTheDocument();
  });

  it("renders full text when no maxLength is provided", () => {
    const longText = "A".repeat(200);
    render(<TruncatedText text={longText} />);
    expect(screen.getByText(longText)).toBeInTheDocument();
  });

  it("renders exactly at maxLength boundary without truncation", () => {
    render(<TruncatedText text="12345" maxLength={5} />);
    expect(screen.getByText("12345")).toBeInTheDocument();
  });

  it("truncates at maxLength + 1", () => {
    render(<TruncatedText text="123456" maxLength={5} />);
    expect(screen.getByText("12345...")).toBeInTheDocument();
  });

  it("renders a span element", () => {
    render(<TruncatedText text="Hello" />);
    const el = screen.getByText("Hello");
    expect(el.tagName).toBe("SPAN");
  });

  it("applies custom className", () => {
    render(<TruncatedText text="Hello" className="custom-class" />);
    const el = screen.getByText("Hello");
    expect(el).toHaveClass("custom-class");
  });

  it("applies truncate class", () => {
    render(<TruncatedText text="Hello" />);
    const el = screen.getByText("Hello");
    expect(el).toHaveClass("truncate");
  });
});
