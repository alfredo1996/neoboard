import * as React from "react";

import { cn } from "@/lib/utils";

export interface FieldErrorProps extends React.HTMLAttributes<HTMLParagraphElement> {
  /** Point the control's `aria-describedby` at this id. */
  id: string;
}

/**
 * Error-message slot for form controls (Epic C #1127). Pair with an
 * `aria-invalid` control: `aria-describedby={id}` on the control, message
 * here. Renders nothing when there is no message.
 */
function FieldError({ id, className, children, ...props }: FieldErrorProps) {
  if (!children) return null;
  return (
    <p
      id={id}
      role="alert"
      className={cn("text-xs text-destructive", className)}
      {...props}
    >
      {children}
    </p>
  );
}

export { FieldError };
