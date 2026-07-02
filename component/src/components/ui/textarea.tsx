import * as React from "react";

import { cn } from "@/lib/utils";
import {
  textareaSizes,
  invalidControlClasses,
  type ControlSize,
} from "./control-sizes";

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  /** Shared design size scale (Epic C #1127) — scales min-height. */
  size?: ControlSize;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, size = "default", ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex w-full rounded-md border border-input bg-transparent py-2 text-base shadow-sm placeholder:text-muted-foreground transition-[color,background-color,border-color,box-shadow] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-standard)] hover:border-[hsl(var(--border-strong))] focus-visible:outline-none focus-visible:border-[hsl(var(--ring))] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          invalidControlClasses,
          textareaSizes[size],
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
