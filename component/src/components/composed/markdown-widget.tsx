"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { highlightSync, ensureHighlighter } from "@/lib/code-highlighter";

export interface MarkdownWidgetProps {
  /** Markdown content to render */
  content?: string;
  className?: string;
}

/**
 * Returns true if a URL is safe for use in `<a href>`.
 * Only allows http:, https:, and relative URLs.
 * Blocks data:, javascript:, vbscript:, blob:, file:, etc.
 */
function isSafeLinkUrl(url: string): boolean {
  // Strip ASCII tabs and newlines that browsers silently remove before parsing,
  // which could bypass protocol checks (e.g. "ja\tvascript:" → "javascript:")
  const trimmed = url
    .replace(/[\t\n\r]/g, "")
    .trim()
    .toLowerCase();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://"))
    return true;
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("?")
  )
    return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false;
  return true;
}

/**
 * Returns true if a URL is safe for use in `<img src>`.
 * Allows http:, https:, data:image/ (inline images), and relative URLs.
 * data: URIs are only safe in img src (cannot execute scripts), never in links.
 */
function isSafeImageUrl(url: string): boolean {
  const trimmed = url
    .replace(/[\t\n\r]/g, "")
    .trim()
    .toLowerCase();
  if (trimmed.startsWith("data:image/")) return true;
  return isSafeLinkUrl(url);
}

/**
 * Checks whether a line is a GFM table alignment row (e.g. `| --- | :---: |`).
 * Uses a linear split-and-check approach instead of a single regex to avoid
 * ReDoS (catastrophic backtracking) on adversarial input.
 */
function isTableAlignmentRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Split by pipe, trim each cell, filter out empty leading/trailing cells
  const cells = trimmed.split("|").map((c) => c.trim());
  // Remove empty strings caused by leading/trailing pipes
  const filtered = cells.filter(
    (c, i) => c.length > 0 || (i > 0 && i < cells.length - 1),
  );
  if (filtered.length === 0) return false;
  // Each non-empty cell must match :?-{3,}:?
  const cellPattern = /^:?-{3,}:?$/;
  return filtered.every((c) => c.length === 0 || cellPattern.test(c));
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
  let fencedCodeLang = "";

  const closeList = () => {
    if (listType) {
      result.push(`</${listType}>`);
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks (```lang...```)
    if (line.startsWith("```")) {
      if (!inFencedCode) {
        // Opening fence — extract optional language tag and start collecting
        closeList();
        if (inBlockquote) {
          result.push("</blockquote>");
          inBlockquote = false;
        }
        inFencedCode = true;
        fencedCodeLang = line.slice(3).trim();
        fencedCodeLines = [];
      } else {
        // Closing fence — emit highlighted or plain block
        inFencedCode = false;
        const code = fencedCodeLines.join("\n");
        const highlighted = fencedCodeLang
          ? highlightSync(code, fencedCodeLang)
          : null;
        if (highlighted) {
          // Shiki output includes <pre><code> — wrap with our spacing classes.
          // Sanitize as defense-in-depth: strip <script>, <style>, and on* attributes.
          const sanitized = highlighted
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");
          result.push(
            `<div class="rounded-md overflow-x-auto my-2 text-sm [&_pre]:p-3 [&_pre]:overflow-x-auto">${sanitized}</div>`,
          );
        } else {
          result.push(
            `<pre class="bg-muted rounded-md p-3 overflow-x-auto text-sm font-mono my-2"><code>${escapeHtml(code)}</code></pre>`,
          );
        }
        fencedCodeLines = [];
        fencedCodeLang = "";
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

    // GFM tables: pipe-delimited rows where the next line is the alignment row
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableAlignmentRow(lines[i + 1])
    ) {
      closeList();
      const parseCells = (row: string) => {
        const parts = row.split("|").map((c) => c.trim());
        // Strip leading/trailing empty strings produced by outer pipes,
        // but preserve empty middle cells to maintain column alignment.
        if (parts.length > 0 && parts[0] === "") parts.shift();
        if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
        return parts;
      };
      const headers = parseCells(line);
      // Parse alignment markers (:---, :---:, ---:) from the separator row
      const alignments = parseCells(lines[i + 1]).map((cell) => {
        const v = cell.trim();
        if (v.startsWith(":") && v.endsWith(":")) return "text-center";
        if (v.endsWith(":")) return "text-right";
        return "text-left";
      });
      i++; // skip alignment row
      const bodyRows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].includes("|")) {
        i++;
        bodyRows.push(parseCells(lines[i]));
      }
      result.push('<table class="w-full border-collapse my-2 text-sm">');
      result.push("<thead><tr>");
      for (let h = 0; h < headers.length; h++) {
        const align = alignments[h] ?? "text-left";
        result.push(
          `<th class="border border-border px-3 py-1.5 font-semibold bg-muted/30 ${align}">${escapeHtml(headers[h])}</th>`,
        );
      }
      result.push("</tr></thead><tbody>");
      for (const row of bodyRows) {
        result.push("<tr>");
        for (let c = 0; c < headers.length; c++) {
          const align = alignments[c] ?? "text-left";
          result.push(
            `<td class="border border-border px-3 py-1.5 ${align}">${escapeHtml(row[c] ?? "")}</td>`,
          );
        }
        result.push("</tr>");
      }
      result.push("</tbody></table>");
      continue;
    }

    // Unordered lists
    if (line.match(/^[-*+]\s+/)) {
      if (listType !== "ul") {
        closeList();
        result.push('<ul class="list-disc pl-6 my-2 space-y-1">');
        listType = "ul";
      }
      result.push(`<li>${processInline(line.replace(/^[-*+]\s+/, ""))}</li>`);
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
      result.push(`<li>${processInline(line.replace(/^\d+\.\s+/, ""))}</li>`);
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
      if (!isSafeImageUrl(url)) return `[image blocked: unsafe URL]`;
      return `<img src="${escapeAttr(url)}" alt="${alt}" class="max-w-full rounded my-1" />`;
    },
  );

  // Links: [text](url) — validate URL.
  // linkText is already HTML-escaped; url needs attribute-quoting via escapeAttr.
  // Use atomic-style groups (negated char classes) to prevent catastrophic backtracking.
  result = result.replace(
    /\[([^\]]{1,500})\]\(([^)\s]{1,2000})\)/g,
    (_match, linkText: string, url: string) => {
      if (!isSafeLinkUrl(url)) return linkText;
      return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">${linkText}</a>`;
    },
  );

  // Bold+Italic: ***text*** or ___text___
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
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
  // Lazy-load Shiki highlighter. On first render code blocks are plain text;
  // once Shiki loads, highlighterReady flips to true and we re-render with
  // syntax-highlighted output via highlightSync().
  const [highlighterReady, setHighlighterReady] = React.useState(false);
  React.useEffect(() => {
    // Only load if content has fenced code blocks with a language tag
    if (!content || !content.includes("```")) return;
    let cancelled = false;
    ensureHighlighter().then((ok) => {
      if (!cancelled && ok) setHighlighterReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [content]);

  // useMemo must be declared before any early return to satisfy Rules of Hooks.
  // Re-compute when highlighterReady changes so code blocks get highlighted.
  const html = React.useMemo(
    () => (content ? parseMarkdown(content) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [content, highlighterReady],
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
      // Safe: parseMarkdown escapes all user text via escapeHtml and validates
      // URLs via isSafeLinkUrl/isSafeImageUrl. No raw user HTML reaches the DOM.
      dangerouslySetInnerHTML={{ __html: html! }} // NOSONAR
    />
  );
}

export { MarkdownWidget };
