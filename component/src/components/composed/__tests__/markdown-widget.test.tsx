import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MarkdownWidget } from "../markdown-widget";

// Mock the code highlighter — Shiki uses WASM which isn't available in jsdom
vi.mock("@/lib/code-highlighter", () => ({
  highlightSync: vi.fn((code: string, lang: string) => {
    if (lang === "unknown-lang") return null;
    return `<pre class="shiki"><code data-lang="${lang}">${code}</code></pre>`;
  }),
  ensureHighlighter: vi.fn(async () => true),
}));

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

  it("re-renders live when the content prop changes (#1053)", () => {
    // The editor writes content to the store on each keystroke; the preview
    // must reflect it immediately, not only on save.
    const { rerender } = render(<MarkdownWidget content="# First" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "First",
    );
    rerender(<MarkdownWidget content="# Second" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Second",
    );
  });

  it("renders multiline content with a heading and a list (#1049)", () => {
    // Now that the editor preserves newlines (textarea), real multiline
    // markdown must render structurally — heading + list items.
    render(<MarkdownWidget content={"# Title\n- item one\n- item two"} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Title",
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("item one");
    expect(items[1]).toHaveTextContent("item two");
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
    render(<MarkdownWidget content='<script>alert("xss")</script>Hello' />);
    // Raw HTML is escaped — there should be no live <script> element in the DOM.
    expect(document.querySelector("script")).toBeNull();
    // The content is displayed as escaped text, not as live HTML.
    const container = screen.getByTestId("markdown-widget");
    expect(container.innerHTML).toContain("&lt;script&gt;");
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
    // Raw HTML is escaped — no actual <img> element with onerror attribute in the DOM.
    expect(container.querySelector("img[onerror]")).toBeNull();
    // The tag is displayed as escaped text, not executed.
    expect(container.innerHTML).toContain("&lt;img");
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
    render(<MarkdownWidget content="![logo](data:image/png;base64,abc)" />);
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

  it("blocks file: URLs in links", () => {
    render(<MarkdownWidget content="[secret](file:///etc/passwd)" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("secret")).toBeInTheDocument();
  });

  it("blocks intent: URLs in links", () => {
    render(<MarkdownWidget content="[open](intent://example#Intent;end)" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("blocks mailto: URLs in links", () => {
    render(<MarkdownWidget content="[Email](mailto:user@example.com)" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Email")).toBeInTheDocument();
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

  it("escapes HTML inside fenced code blocks without language tag", () => {
    // Without a language tag, the plain fallback path escapes HTML
    render(<MarkdownWidget content={"```\n<div>test</div>\n```"} />);
    const container = screen.getByTestId("markdown-widget");
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
    // Raw HTML is escaped — no actual <img> element with onerror attribute in the DOM.
    expect(container.querySelector("img[onerror]")).toBeNull();
    // The tag is displayed as escaped text, not executed.
    expect(container.innerHTML).toContain("&lt;img");
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

  // ── GFM Tables ────────────────────────────────────────────────────────────

  it("renders a basic GFM table with headers and body rows", () => {
    const md = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    const headers = table!.querySelectorAll("th");
    expect(headers).toHaveLength(2);
    expect(headers[0].textContent).toBe("Name");
    expect(headers[1].textContent).toBe("Age");
    const rows = table!.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
    const cells = rows[0].querySelectorAll("td");
    expect(cells[0].textContent).toBe("Alice");
    expect(cells[1].textContent).toBe("30");
  });

  it("renders a GFM table with alignment markers (colons)", () => {
    const md =
      "| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.querySelector("table")).not.toBeNull();
    const headers = container.querySelectorAll("th");
    expect(headers).toHaveLength(3);
  });

  it("renders table with empty cells when row has fewer columns than header", () => {
    const md = "| A | B | C |\n| --- | --- | --- |\n| x |";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    const cells = container.querySelectorAll("tbody td");
    expect(cells).toHaveLength(3);
    // Last two cells should be empty
    expect(cells[1].textContent).toBe("");
    expect(cells[2].textContent).toBe("");
  });

  it("closes an open list before rendering a table", () => {
    const md = "- item\n| A | B |\n| --- | --- |\n| 1 | 2 |";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    const ulCloseIndex = container.innerHTML.indexOf("</ul>");
    const tableIndex = container.innerHTML.indexOf("<table");
    expect(ulCloseIndex).toBeLessThan(tableIndex);
  });

  it("escapes HTML in table cell content", () => {
    const md = "| Header |\n| --- |\n| <script>alert(1)</script> |";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.innerHTML).toContain("&lt;script&gt;");
    expect(container.querySelector("script")).toBeNull();
  });

  it("does not treat lines as table when alignment row is missing", () => {
    const md = "| not | a | table |\n| these are just pipes |";
    render(<MarkdownWidget content={md} />);
    const container = screen.getByTestId("markdown-widget");
    expect(container.querySelector("table")).toBeNull();
  });

  // ── Syntax highlighting ─────────────────────────────────────────────────

  it("uses syntax highlighter for fenced code with language tag", () => {
    render(<MarkdownWidget content={"```sql\nSELECT * FROM users;\n```"} />);
    const container = screen.getByTestId("markdown-widget");
    const shikiPre = container.querySelector("pre.shiki");
    expect(shikiPre).not.toBeNull();
    const code = shikiPre!.querySelector("code");
    expect(code).not.toBeNull();
    expect(code!.getAttribute("data-lang")).toBe("sql");
  });

  it("falls back to plain pre/code when language is unknown", () => {
    render(<MarkdownWidget content={"```unknown-lang\nsome code\n```"} />);
    const container = screen.getByTestId("markdown-widget");
    // Should NOT have shiki class — highlightSync returns null for unknown langs
    const shikiPre = container.querySelector("pre.shiki");
    expect(shikiPre).toBeNull();
    // Should have plain pre/code
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain("some code");
  });

  it("renders plain code block when no language tag specified", () => {
    render(<MarkdownWidget content={"```\nplain code\n```"} />);
    const container = screen.getByTestId("markdown-widget");
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain("plain code");
    // No shiki class — no language means no highlighting
    expect(container.querySelector("pre.shiki")).toBeNull();
  });
  // The inline emphasis passes ran over markup the link/image passes had
  // already emitted, so underscores and asterisks living inside a URL — or
  // inside the generated target="_blank" — were treated as user emphasis and
  // spliced <em> into href/src/target (#1290). Not an XSS hole (escapeAttr
  // still escapes quotes) but the links are dead.
  describe("emphasis must not rewrite generated markup (#1290)", () => {
    const container = () => screen.getByTestId("markdown-widget");

    it('keeps target="_blank" intact across two links on one line', () => {
      // The worst case: the _ from the first link's target="_blank" pairs with
      // the _ from the second's, and the non-greedy <em> swallows everything
      // between the two anchors.
      render(
        <MarkdownWidget content="[one](https://a.com) and [two](https://b.com)" />,
      );
      const anchors = container().querySelectorAll("a");
      expect(anchors).toHaveLength(2);
      for (const a of anchors) expect(a.getAttribute("target")).toBe("_blank");
      expect(container().querySelector("em")).toBeNull();
    });

    it.each([
      ["underscores", "https://ex.com/a_b_c"],
      ["asterisks", "https://ex.com/a*b*c"],
    ])("round-trips a URL containing %s", (_label, url) => {
      render(<MarkdownWidget content={`See [docs](${url}) here`} />);
      expect(container().querySelector("a")!.getAttribute("href")).toBe(url);
    });

    it("round-trips an image URL containing underscores", () => {
      const url = "https://ex.com/my_photo_1.png";
      render(<MarkdownWidget content={`![pic](${url})`} />);
      expect(container().querySelector("img")!.getAttribute("src")).toBe(url);
    });

    it("still emphasises plain prose", () => {
      render(<MarkdownWidget content="*a* and **b** and _c_" />);
      expect(container().querySelectorAll("em")).toHaveLength(2);
      expect(container().querySelectorAll("strong")).toHaveLength(1);
    });

    it("still emphasises inside link text", () => {
      render(<MarkdownWidget content="[*link text*](https://a.com)" />);
      const anchors = container().querySelectorAll("a");
      expect(anchors).toHaveLength(1);
      expect(anchors[0].innerHTML).toContain("<em>");
      expect(anchors[0].getAttribute("target")).toBe("_blank");
    });
  });

  // prose/prose-sm/dark:prose-invert emit no CSS — @tailwindcss/typography is
  // not a dependency and never was. With preflight resetting headings to
  // font-size: inherit and the wrapper pinning text-sm, every heading level
  // rendered at 14px, differing only by weight (#1290).
  describe("heading scale (#1290)", () => {
    it("gives h1, h2 and h3+ distinct sizes", () => {
      render(<MarkdownWidget content={"# H1\n\n## H2\n\n### H3"} />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveClass("text-h2");
      expect(screen.getByRole("heading", { level: 2 })).toHaveClass("text-h3");
      expect(screen.getByRole("heading", { level: 3 })).toHaveClass("text-sm");
    });

    it("carries no dead prose classes", () => {
      render(<MarkdownWidget content="# H1" />);
      const cls = screen.getByTestId("markdown-widget").className;
      for (const dead of ["prose", "prose-sm", "dark:prose-invert"])
        expect(cls.split(/\s+/)).not.toContain(dead);
    });
  });
});
