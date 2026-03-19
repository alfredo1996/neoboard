"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";

export interface MarkdownWidgetProps {
  /** Markdown content to render */
  content?: string;
  className?: string;
}

/**
 * Returns true if a URL uses a safe protocol.
 * Only allows http:, https:, and data:image/ (for inline images).
 * All other schemes (javascript:, vbscript:, blob:, file:, mailto:, etc.)
 * are blocked.
 */
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return true;
  if (trimmed.startsWith("data:image/")) return true;
  // Relative URLs (no scheme) are safe — they resolve against the page origin.
  if (trimmed.startsWith("/") || trimmed.startsWith("#") || trimmed.startsWith("?")) return true;
  // Reject anything with an explicit scheme that didn't match above.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false;
  // Bare text (e.g., "example.com") — treat as relative, safe.
  return true;
}

/**
 * Simple markdown parser that converts a subset of markdown to HTML.
 * Handles: headings, bold, italic, code, links, lists, blockquotes, paragraphs.
 *
 * Does NOT use a full markdown library (like marked/remark) to keep the bundle
 * minimal. For a dashboard widget, the common subset is sufficient.
 */
function parseMarkdown(md: string): string {
  // Process line-by-line for block elements
  const lines = md.split("\n");
  const result: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let inBlockquote = false;
  let inFencedCode = false;
  let fencedCodeLines: string[] = [];

  const closeList = () => {
    if (listType) {
      result.push(`</${listType}>`);
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks (```...```)
    if (line.startsWith("```")) {
      if (!inFencedCode) {
        // Opening fence — start collecting code lines
        closeList();
        if (inBlockquote) {
          result.push("</blockquote>");
          inBlockquote = false;
        }
        inFencedCode = true;
        fencedCodeLines = [];
      } else {
        // Closing fence — emit the block
        inFencedCode = false;
        result.push(
          `<pre class="bg-muted rounded-md p-3 overflow-x-auto text-sm font-mono my-2"><code>${escapeHtml(fencedCodeLines.join("\n"))}</code></pre>`,
        );
        fencedCodeLines = [];
      }
      continue;
    }

    if (inFencedCode) {
      fencedCodeLines.push(line);
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      closeList();
      if (inBlockquote) {
        result.push("</blockquote>");
        inBlockquote = false;
      }
      const level = headingMatch[1].length;
      result.push(
        `<h${level} class="font-semibold mt-3 mb-1">${processInline(headingMatch[2])}</h${level}>`,
      );
      continue;
    }

    // Blockquotes
    if (line.startsWith("> ")) {
      closeList();
      if (!inBlockquote) {
        result.push(
          '<blockquote class="border-l-4 border-muted-foreground/30 pl-4 my-2 text-muted-foreground italic">',
        );
        inBlockquote = true;
      }
      result.push(`<p>${processInline(line.slice(2))}</p>`);
      continue;
    } else if (inBlockquote) {
      result.push("</blockquote>");
      inBlockquote = false;
    }

    // Unordered lists
    if (line.match(/^[-*+]\s+/)) {
      if (listType !== "ul") {
        closeList();
        result.push('<ul class="list-disc pl-6 my-2 space-y-1">');
        listType = "ul";
      }
      result.push(
        `<li>${processInline(line.replace(/^[-*+]\s+/, ""))}</li>`,
      );
      continue;
    } else if (listType === "ul") {
      closeList();
    }

    // Ordered lists
    if (line.match(/^\d+\.\s+/)) {
      if (listType !== "ol") {
        closeList();
        result.push('<ol class="list-decimal pl-6 my-2 space-y-1">');
        listType = "ol";
      }
      result.push(
        `<li>${processInline(line.replace(/^\d+\.\s+/, ""))}</li>`,
      );
      continue;
    }

    // Horizontal rule
    if (
      line.match(/^---+$/) ||
      line.match(/^\*\*\*+$/) ||
      line.match(/^___+$/)
    ) {
      closeList();
      result.push('<hr class="my-4 border-border" />');
      continue;
    }

    // Empty lines
    if (line.trim() === "") {
      continue;
    }

    // Paragraphs (default)
    closeList();
    result.push(`<p class="my-1">${processInline(line)}</p>`);
  }

  // Close any open fenced code block (unterminated)
  if (inFencedCode && fencedCodeLines.length > 0) {
    result.push(
      `<pre class="bg-muted rounded-md p-3 overflow-x-auto text-sm font-mono my-2"><code>${escapeHtml(fencedCodeLines.join("\n"))}</code></pre>`,
    );
  }

  closeList();
  if (inBlockquote) result.push("</blockquote>");

  return result.join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escapes only the double-quote character for safe use in HTML attributes. */
function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;");
}

/**
 * Process inline markdown: bold, italic, code, links, images.
 * URLs in links and images are validated against dangerous schemes.
 *
 * The input text is HTML-escaped at the start so that raw user-supplied HTML
 * (e.g. `<a href="javascript:...">`) cannot reach dangerouslySetInnerHTML.
 * Only tags generated by this function are rendered as real HTML.
 */
function processInline(text: string): string {
  // Escape user input so raw HTML tags become literal text.
  // Subsequent regex captures are already escaped; only URLs need attribute-safe quoting.
  let result = escapeHtml(text);

  // Inline code — $1 is already HTML-escaped, safe to embed directly.
  result = result.replace(
    /`([^`]+)`/g,
    '<code class="bg-muted rounded px-1 py-0.5 text-sm font-mono">$1</code>',
  );

  // Images: ![alt](url) — validate URL.
  // alt is already HTML-escaped; url needs attribute-quoting via escapeAttr.
  result = result.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, alt: string, url: string) => {
      if (!isSafeUrl(url)) return `[image blocked: unsafe URL]`;
      return `<img src="${escapeAttr(url)}" alt="${alt}" class="max-w-full rounded my-1" />`;
    },
  );

  // Links: [text](url) — validate URL.
  // linkText is already HTML-escaped; url needs attribute-quoting via escapeAttr.
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, linkText: string, url: string) => {
      if (!isSafeUrl(url)) return linkText;
      return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">${linkText}</a>`;
    },
  );

  // Bold+Italic: ***text*** or ___text___
  result = result.replace(
    /\*\*\*(.+?)\*\*\*/g,
    "<strong><em>$1</em></strong>",
  );
  result = result.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/__(.+?)__/g, "<strong>$1</strong>");

  // Italic: *text* or _text_
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(/_(.+?)_/g, "<em>$1</em>");

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, "<del>$1</del>");

  return result;
}

function MarkdownWidget({ content, className }: MarkdownWidgetProps) {
  // useMemo must be declared before any early return to satisfy Rules of Hooks.
  const html = React.useMemo(
    () => (content ? parseMarkdown(content) : null),
    [content],
  );

  if (!content) {
    return (
      <div
        data-testid="markdown-widget"
        className={cn("h-full flex items-center justify-center", className)}
      >
        <EmptyState
          title="No content"
          description="Add markdown content in the widget settings."
          className="py-6"
        />
      </div>
    );
  }

  return (
    <div
      data-testid="markdown-widget"
      className={cn(
        "h-full overflow-auto p-4 prose prose-sm dark:prose-invert max-w-none",
        "text-sm text-foreground",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html! }}
    />
  );
}

export { MarkdownWidget };
