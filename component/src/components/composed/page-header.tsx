import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
  /**
   * The <h1>. It takes focus by script (tabIndex -1, never a tab stop): where
   * a page sends focus once the row it was on is deleted (#2086).
   */
  titleRef?: React.Ref<HTMLHeadingElement>;
}

function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
  titleRef,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="text-lg font-semibold tracking-tight outline-none"
          >
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export { PageHeader };
