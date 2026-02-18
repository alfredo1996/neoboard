import * as React from "react";
import { cn } from "@/lib/utils";

export interface GridItemProps {
  id: string;
  children: React.ReactNode;
  className?: string;
}

const GridItem = React.forwardRef<HTMLDivElement, GridItemProps>(
  ({ id, children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        key={id}
        className={cn("h-full overflow-hidden", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
GridItem.displayName = "GridItem";

export { GridItem };
