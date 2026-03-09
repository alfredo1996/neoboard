import * as React from "react";
import { cn } from "@/lib/utils";

export interface CodePreviewProps {
  /** The code/query text to display */
  value: string;
  /** Language label shown in the top-right corner */
  language?: string;
  /** Max visible lines before truncation. 0 = no limit. @default 3 */
  maxLines?: number;
  /** Additional CSS classes for the outer container */
  className?: string;
}

/**
 * A compact, read-only code preview strip for displaying query snippets
 * in cards and thumbnails. Designed to be an accent element, not the
 * primary content of the card.
 */
function CodePreview({ value, language, maxLines = 3, className }: CodePreviewProps) {
  const [expanded, setExpanded] = React.useState(false);
  const text = value || "No query";

  const lines = text.split("\n");
  const isTruncated = maxLines > 0 && lines.length > maxLines && !expanded;
  const displayText = isTruncated ? lines.slice(0, maxLines).join("\n") + " …" : text;

  return (
    <div
      data-testid="code-preview"
      className={cn(
        "relative rounded-md bg-muted/40 overflow-hidden",
        className,
      )}
    >
      {language && (
        <span className="absolute top-1 right-1.5 text-[9px] font-medium text-muted-foreground/50 uppercase select-none pointer-events-none">
          {language}
        </span>
      )}
      <pre className={cn("px-2.5 py-2 overflow-hidden", !expanded && "h-full")}>
        <code className="text-[11px] leading-snug text-muted-foreground font-mono whitespace-pre-wrap break-all">
          {displayText}
        </code>
      </pre>
      {maxLines > 0 && lines.length > maxLines && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded((prev) => !prev); }}
          className="absolute bottom-0.5 right-1.5 text-[9px] font-medium text-primary hover:underline cursor-pointer select-none"
        >
          {expanded ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

export { CodePreview };
