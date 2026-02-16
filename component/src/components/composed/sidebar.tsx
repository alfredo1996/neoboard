import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SidebarProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
  width?: number;
  collapsedWidth?: number;
}

function Sidebar({
  children,
  header,
  footer,
  collapsed = false,
  onCollapsedChange,
  className,
  width = 240,
  collapsedWidth = 56,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex flex-col h-full border-r bg-background transition-[width] duration-200",
        className
      )}
      style={{ width: collapsed ? collapsedWidth : width }}
    >
      {header && (
        <div className="flex items-center border-b px-3 py-3">
          {header}
        </div>
      )}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
        {children}
      </nav>
      {footer && (
        <div className="border-t px-3 py-3">
          {footer}
        </div>
      )}
      {onCollapsedChange && (
        <div className="border-t px-2 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-full"
            onClick={() => onCollapsedChange(!collapsed)}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
            <span className="sr-only">
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </span>
          </Button>
        </div>
      )}
    </aside>
  );
}

export { Sidebar };
