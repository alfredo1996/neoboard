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
 * Simple markdown parser that converts a subset of markdown to HTML.
 * Handles: headings, bold, italic, code, links, lists, blockquotes, paragraphs.
 *
 * Does NOT use a full markdown library (like marked/remark) to keep the bundle
 * minimal. For a dashboard widget, the common subset is sufficient.
 */
function parseMarkdown(md: string): string {
  let html = md;

  // Sanitize: strip <script> tags and event handlers
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  html = html.replace(/on\w+\s*=\s*"[^"]*"/gi, "");
  html = html.replace(/on\w+\s*=\s*'[^']*'/gi, "");

  // Fenced code blocks (```...```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="bg-muted rounded-md p-3 overflow-x-auto text-sm font-mono my-2"><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // Process line-by-line for block elements
  const lines = html.split("\n");
  const result: string[] = [];
  let inList = false;
  let inBlockquote = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (inList) { result.push("</ul>"); inList = false; }
      if (inBlockquote) { result.push("</blockquote>"); inBlockquote = false; }
      const level = headingMatch[1].length;
      result.push(`<h${level} class="font-semibold mt-3 mb-1">${processInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Blockquotes
    if (line.startsWith("> ")) {
      if (inList) { result.push("</ul>"); inList = false; }
      if (!inBlockquote) {
        result.push('<blockquote class="border-l-4 border-muted-foreground/30 pl-4 my-2 text-muted-foreground italic">');
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
      if (!inList) {
        result.push('<ul class="list-disc pl-6 my-2 space-y-1">');
        inList = true;
      }
      result.push(`<li>${processInline(line.replace(/^[-*+]\s+/, ""))}</li>`);
      continue;
    } else if (inList) {
      result.push("</ul>");
      inList = false;
    }

    // Ordered lists
    if (line.match(/^\d+\.\s+/)) {
      if (!inList) {
        result.push('<ol class="list-decimal pl-6 my-2 space-y-1">');
        inList = true;
      }
      result.push(`<li>${processInline(line.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/) || line.match(/^\*\*\*+$/) || line.match(/^___+$/)) {
      if (inList) { result.push("</ul>"); inList = false; }
      result.push('<hr class="my-4 border-border" />');
      continue;
    }

    // Empty lines
    if (line.trim() === "") {
      continue;
    }

    // Paragraphs (default)
    if (inList) { result.push("</ul>"); inList = false; }
    result.push(`<p class="my-1">${processInline(line)}</p>`);
  }

  if (inList) result.push("</ul>");
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

/**
 * Process inline markdown: bold, italic, code, links, images.
 */
function processInline(text: string): string {
  let result = text;

  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code class="bg-muted rounded px-1 py-0.5 text-sm font-mono">$1</code>');

  // Images: ![alt](url)
  result = result.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" class="max-w-full rounded my-1" />',
  );

  // Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">$1</a>',
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

  const html = React.useMemo(() => parseMarkdown(content), [content]);

  return (
    <div
      data-testid="markdown-widget"
      className={cn(
        "h-full overflow-auto p-4 prose prose-sm dark:prose-invert max-w-none",
        "text-sm text-foreground",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export { MarkdownWidget };
