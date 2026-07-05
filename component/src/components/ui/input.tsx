import * as React from "react";

import { cn } from "@/lib/utils";
import {
  controlSizes,
  invalidControlClasses,
  type ControlSize,
} from "./control-sizes";

// Native `size` (a character-count number) is replaced by the shared design
// size scale (Epic C #1127).
export interface InputProps extends Omit<
  React.ComponentProps<"input">,
  "size"
> {
  size?: ControlSize;
}

/**
 * Single-line text input on the shared control size scale (`size`: sm/default/lg) with aria-invalid styling.
 * When to use: short values — connection host, port, dashboard title, parameter defaults.
 * When not to: use Textarea for multi-line text, QueryEditor for Cypher/SQL, Select or Combobox for picking from options.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = "default", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Focus ring is now the solid citrine --ring (was --accent-soft at
          // 12% alpha — effectively invisible). On focus the border also warms
          // to citrine; subtle border-strong on hover for affordance. Motion
          // wired to the design-system tokens.
          "flex w-full rounded-md border border-input bg-transparent py-1 text-base shadow-sm transition-[color,border-color,box-shadow] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-standard)] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-[hsl(var(--border-strong))] focus-visible:border-[hsl(var(--ring))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          invalidControlClasses,
          controlSizes[size],
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
