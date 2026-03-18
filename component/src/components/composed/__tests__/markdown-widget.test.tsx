import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MarkdownWidget } from "../markdown-widget";

describe("MarkdownWidget", () => {
  it("renders markdown content as HTML", () => {
    render(<MarkdownWidget content="**bold text**" />);
    const bold = screen.getByText("bold text");
    expect(bold.tagName).toBe("STRONG");
  });

  it("renders headings correctly", () => {
    render(<MarkdownWidget content="# Main Heading" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Main Heading");
  });

  it("renders paragraphs", () => {
    render(<MarkdownWidget content="Hello world" />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders lists", () => {
    const content = ["- Item 1", "- Item 2", "- Item 3"].join("\n");
    render(<MarkdownWidget content={content} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
  });

  it("renders code blocks", () => {
    render(<MarkdownWidget content="`inline code`" />);
    const code = screen.getByText("inline code");
    expect(code.tagName).toBe("CODE");
  });

  it("renders links with target=_blank and rel=noopener noreferrer", () => {
    render(<MarkdownWidget content="[Visit](https://example.com)" />);
    const link = screen.getByRole("link", { name: "Visit" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders empty state when content is empty", () => {
    render(<MarkdownWidget content="" />);
    expect(screen.getByText("No content")).toBeInTheDocument();
  });

  it("renders empty state when content is undefined", () => {
    render(<MarkdownWidget />);
    expect(screen.getByText("No content")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <MarkdownWidget content="test" className="custom-class" />,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("has data-testid for testing", () => {
    render(<MarkdownWidget content="test" />);
    expect(screen.getByTestId("markdown-widget")).toBeInTheDocument();
  });

  it("sanitizes script tags in markdown", () => {
    render(
      <MarkdownWidget content='<script>alert("xss")</script>Hello' />,
    );
    // Script should not be rendered
    expect(screen.queryByText('alert("xss")')).not.toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders blockquotes", () => {
    render(<MarkdownWidget content="> This is a quote" />);
    const blockquote = screen.getByText("This is a quote");
    expect(blockquote.closest("blockquote")).toBeTruthy();
  });

  it("sanitizes javascript: URLs in links", () => {
    // eslint-disable-next-line no-script-url
    render(<MarkdownWidget content="[Click](javascript:alert(1))" />);
    const link = screen.queryByRole("link");
    // Link should either not exist or have safe href
    if (link) {
      expect(link).not.toHaveAttribute(
        "href",
        expect.stringMatching(/^javascript:/i),
      );
    }
  });

  it("sanitizes javascript: URLs in images", () => {
    // eslint-disable-next-line no-script-url
    render(<MarkdownWidget content="![alt](javascript:alert(1))" />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.innerHTML).not.toContain("javascript:");
    expect(container.innerHTML).toContain("[image blocked: unsafe URL]");
  });

  it("sanitizes unquoted event handlers", () => {
    render(<MarkdownWidget content="<img src=x onerror=alert(1)>" />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.innerHTML).not.toContain("onerror");
  });

  it("sanitizes vbscript: URLs in links", () => {
    render(<MarkdownWidget content="[Click](vbscript:MsgBox(1))" />);
    const link = screen.queryByRole("link");
    if (link) {
      expect(link).not.toHaveAttribute(
        "href",
        expect.stringMatching(/^vbscript:/i),
      );
    }
  });
});
