import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
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
  icon,
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
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className,
      )}
    >
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
      {secondaryAction && (
        <div className={cn(action ? "mt-3" : "mt-6", "text-sm")}>
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

export { EmptyState };
