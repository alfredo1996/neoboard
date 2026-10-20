import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** When given, renders a 16px remove button named "Remove <label>". */
  readonly onRemove?: () => void;
}

/**
 * A hairline box, 20px tall, 12px text, no fill. A label or category.
 * When to use: "Shared", a chart type, a chip in a multi-select.
 * When not to: a state — use Status; a count — use Badge.
 */
function Tag({ className, children, onRemove, ...props }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-0.5 whitespace-nowrap rounded border border-border-strong bg-transparent px-1.5 text-xs leading-none text-foreground-2",
        className,
      )}
      {...props}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${typeof children === "string" ? children : ""}`.trim()}
          className="-mr-1 inline-grid size-4 place-items-center rounded-[3px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X aria-hidden="true" className="size-2.5" strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}

export { Tag };
