import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type TagBaseProps = React.HTMLAttributes<HTMLSpanElement>;

/**
 * A remove button is named "Remove <text>" for text children; any other
 * children must say what is removed, or every chip reads just "Remove".
 */
export type TagProps = TagBaseProps &
  (
    | { readonly onRemove?: undefined; readonly removeLabel?: string }
    | {
        readonly onRemove: () => void;
        readonly children: string;
        readonly removeLabel?: string;
      }
    | { readonly onRemove: () => void; readonly removeLabel: string }
  );

/**
 * The remove control, shared with the multi-select chips whose × is nested in
 * a trigger. `!size-2.5` on the glyph beats Button's `[&_svg]:size-4`.
 */
export const tagRemoveClass =
  "-mr-1 inline-grid size-4 cursor-pointer place-items-center rounded-[3px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";
export const tagRemoveGlyphClass = "!size-2.5";

/**
 * A hairline box, 20px tall, 12px text, no fill. A label or category.
 * When to use: "Shared", a chart type, a chip in a multi-select.
 * When not to: a state — use Status; a count — use Badge.
 */
function Tag({
  className,
  children,
  onRemove,
  removeLabel,
  ...props
}: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-0.5 whitespace-nowrap rounded border border-border-strong bg-transparent px-1.5 text-xs font-normal leading-none text-foreground-2",
        className,
      )}
      {...props}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? `Remove ${children as string}`}
          className={tagRemoveClass}
        >
          <X
            aria-hidden="true"
            className={tagRemoveGlyphClass}
            strokeWidth={2.5}
          />
        </button>
      )}
    </span>
  );
}

export { Tag };
