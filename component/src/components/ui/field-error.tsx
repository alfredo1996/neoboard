import * as React from "react";
import { AlertCircle } from "lucide-react";

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
      className={cn(
        "flex items-start gap-1.5 text-xs text-destructive",
        className,
      )}
      {...props}
    >
      <AlertCircle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
      {children}
    </p>
  );
}

export { FieldError };
