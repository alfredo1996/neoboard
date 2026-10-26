import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Optional secondary action (e.g. a "Read the docs" link) rendered below `action`. */
  secondaryAction?: React.ReactNode;
  className?: string;
  /**
   * ARIA role for the root. Opt-in: a host announcing "no rows" wants
   * `role="status"`, a modal's static empty state must not be a live
   * region (#1584).
   */
  role?: React.AriaRole;
}

function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  className,
  role,
}: EmptyStateProps) {
  return (
    <div
      role={role}
      className={cn("flex max-w-[460px] flex-col gap-2 py-2", className)}
    >
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
      {secondaryAction && <div className="text-sm">{secondaryAction}</div>}
    </div>
  );
}

export { EmptyState };
