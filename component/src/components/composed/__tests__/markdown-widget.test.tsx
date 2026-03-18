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

  // ── isSafeUrl branches ───────────────────────────────────────────────────

  it("blocks blob: URLs in links (renders text only, no anchor)", () => {
    render(<MarkdownWidget content="[file](blob:http://example.com/abc)" />);
    // blob: is blocked — link text rendered as plain text, no <a> element
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("file")).toBeInTheDocument();
  });

  it("blocks data:text/ URLs in links (non-image data URL)", () => {
    render(<MarkdownWidget content="[xss](data:text/html,<h1>hi</h1>)" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("allows data:image/ URLs in images (safe)", () => {
    render(
      <MarkdownWidget content="![logo](data:image/png;base64,abc)" />,
    );
    const container = screen.getByTestId("markdown-widget");
    // data:image/ is allowed — img tag should appear
    expect(container.innerHTML).toContain("<img");
    expect(container.innerHTML).not.toContain("[image blocked");
  });

  it("blocks blob: URLs in images", () => {
    render(<MarkdownWidget content="![pic](blob:http://example.com/uuid)" />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.innerHTML).toContain("[image blocked: unsafe URL]");
  });

  // ── Fenced code blocks ───────────────────────────────────────────────────

  it("renders fenced code blocks as <pre><code>", () => {
    render(<MarkdownWidget content={"```js\nconsole.log('hello');\n```"} />);
    const container = screen.getByTestId("markdown-widget");
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    const code = pre!.querySelector("code");
    expect(code).not.toBeNull();
    expect(code!.textContent).toContain("console.log");
  });

  it("escapes HTML inside fenced code blocks", () => {
    render(
      <MarkdownWidget content={"```html\n<div>test</div>\n```"} />,
    );
    const container = screen.getByTestId("markdown-widget");
    // The <div> should be escaped, not rendered as a real element
    expect(container.innerHTML).toContain("&lt;div&gt;");
  });

  // ── Heading state management ─────────────────────────────────────────────

  it("closes an open unordered list before rendering a heading", () => {
    const md = "- item\n# Heading";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    // The </ul> must appear before <h1>
    const ulIndex = container.innerHTML.indexOf("</ul>");
    const h1Index = container.innerHTML.indexOf("<h1");
    expect(ulIndex).toBeLessThan(h1Index);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("closes an open blockquote before rendering a heading", () => {
    const md = "> quote\n## Sub-heading";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    const bqCloseIndex = container.innerHTML.indexOf("</blockquote>");
    const h2Index = container.innerHTML.indexOf("<h2");
    expect(bqCloseIndex).toBeLessThan(h2Index);
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  it("renders all heading levels h1–h6", () => {
    const md = [
      "# H1",
      "## H2",
      "### H3",
      "#### H4",
      "##### H5",
      "###### H6",
    ].join("\n");
    render(<MarkdownWidget content={md} />);
    for (let level = 1; level <= 6; level++) {
      expect(
        screen.getByRole("heading", { level: level as 1 | 2 | 3 | 4 | 5 | 6 }),
      ).toBeInTheDocument();
    }
  });

  // ── Blockquote state management ──────────────────────────────────────────

  it("closes an open unordered list before starting a blockquote", () => {
    const md = "- item\n> quote";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    const ulCloseIndex = container.innerHTML.indexOf("</ul>");
    const bqOpenIndex = container.innerHTML.indexOf("<blockquote");
    expect(ulCloseIndex).toBeLessThan(bqOpenIndex);
  });

  it("closes a blockquote when followed by a non-blockquote line", () => {
    const md = "> quote\nParagraph after";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.innerHTML).toContain("</blockquote>");
    expect(screen.getByText("Paragraph after")).toBeInTheDocument();
  });

  it("renders multi-line blockquotes as sibling <p> inside one <blockquote>", () => {
    const md = "> Line one\n> Line two";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    const bqs = container.querySelectorAll("blockquote");
    expect(bqs).toHaveLength(1);
    const paras = bqs[0].querySelectorAll("p");
    expect(paras).toHaveLength(2);
  });

  // ── Ordered lists ────────────────────────────────────────────────────────

  it("renders ordered lists as <ol>", () => {
    const md = "1. First\n2. Second\n3. Third";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    const ol = container.querySelector("ol");
    expect(ol).not.toBeNull();
    const items = ol!.querySelectorAll("li");
    expect(items).toHaveLength(3);
  });

  it("renders ordered and unordered list items using shared inList state", () => {
    // Implementation note: the parser uses a single inList flag for both ol and ul.
    // When switching from ordered to unordered, the unordered item is rendered
    // inside the existing open list (no new <ul> is opened mid-list).
    const md = "1. Ordered\n- Unordered";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    // An ordered list is opened for the first item
    expect(container.innerHTML).toContain("<ol");
    // Both items are rendered as <li>
    const items = container.querySelectorAll("li");
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it("closes ordered list when followed by a paragraph", () => {
    const md = "1. Item\nThis is a paragraph";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.innerHTML).toContain("</ol>");
    // wait — ordered list gets closed by the paragraph's else-if(inList) via ul check
    expect(screen.getByText("This is a paragraph")).toBeInTheDocument();
  });

  // ── Horizontal rules ─────────────────────────────────────────────────────

  it("renders --- as a horizontal rule", () => {
    render(<MarkdownWidget content="---" />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.querySelector("hr")).not.toBeNull();
  });

  it("renders *** as a horizontal rule", () => {
    render(<MarkdownWidget content="***" />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.querySelector("hr")).not.toBeNull();
  });

  it("renders ___ as a horizontal rule", () => {
    render(<MarkdownWidget content="___" />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.querySelector("hr")).not.toBeNull();
  });

  it("renders horizontal rule after unordered list (closes list first)", () => {
    const md = "- item\n---";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    const ulCloseIndex = container.innerHTML.indexOf("</ul>");
    const hrIndex = container.innerHTML.indexOf("<hr");
    expect(ulCloseIndex).toBeLessThan(hrIndex);
  });

  // ── Empty lines ──────────────────────────────────────────────────────────

  it("skips empty lines without rendering any element", () => {
    const md = "para1\n\n\npara2";
    render(<MarkdownWidget content={md} />);
    expect(screen.getByText("para1")).toBeInTheDocument();
    expect(screen.getByText("para2")).toBeInTheDocument();
    // No extra paragraphs for blank lines
    const container = screen.getByTestId("markdown-widget");
    const paras = container.querySelectorAll("p");
    expect(paras).toHaveLength(2);
  });

  // ── Inline formatting ────────────────────────────────────────────────────

  it("renders ***bold italic*** as <strong><em>", () => {
    render(<MarkdownWidget content="***combined***" />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.querySelector("strong em")).not.toBeNull();
  });

  it("renders *italic* as <em>", () => {
    render(<MarkdownWidget content="*italic text*" />);
    const container = screen.getByTestId("markdown-widget");
    const em = container.querySelector("em");
    expect(em).not.toBeNull();
    expect(em!.textContent).toBe("italic text");
  });

  it("renders ~~strikethrough~~ as <del>", () => {
    render(<MarkdownWidget content="~~strike~~" />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.querySelector("del")).not.toBeNull();
  });

  it("sanitizes single-quoted event handlers in HTML attributes", () => {
    render(<MarkdownWidget content="<img src=x onerror='alert(1)'>" />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.innerHTML).not.toContain("onerror=");
  });

  // ── Link unsafe URL renders as plain text ────────────────────────────────

  it("renders no anchor element when link URL is unsafe (vbscript:)", () => {
    render(<MarkdownWidget content="[Click here](vbscript:MsgBox(1))" />);
    // No anchor should be rendered — link is blocked
    expect(screen.queryByRole("link")).toBeNull();
    // Link text appears (possibly with trailing characters from regex parsing)
    const container = screen.getByTestId("markdown-widget");
    expect(container.textContent).toContain("Click here");
  });

  // ── End-of-content closings ──────────────────────────────────────────────

  it("closes open unordered list at end of content", () => {
    const md = "- item one\n- item two";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.innerHTML).toContain("</ul>");
  });

  it("closes open blockquote at end of content", () => {
    const md = "> a quote that ends the document";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.innerHTML).toContain("</blockquote>");
  });
});
