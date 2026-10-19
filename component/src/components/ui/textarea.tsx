import * as React from "react";

import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";
import {
  fieldBaseClasses,
  textareaSizes,
  invalidControlClasses,
  type ControlSize,
} from "./control-sizes";

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  /** Shared design size scale (Epic C #1127) — scales min-height. */
  size?: ControlSize;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, size = "default", ...rawProps }, ref) => {
    const props = useFieldControl(rawProps);
    return (
      <textarea
        className={cn(
          "flex py-2",
          fieldBaseClasses,
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
