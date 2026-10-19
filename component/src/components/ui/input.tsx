import * as React from "react";

import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";
import {
  fieldBaseClasses,
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
  ({ className, type, size = "default", ...rawProps }, ref) => {
    const props = useFieldControl(rawProps);
    return (
      <input
        type={type}
        className={cn(
          "flex py-1 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          fieldBaseClasses,
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
