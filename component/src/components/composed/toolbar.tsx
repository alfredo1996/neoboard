import * as React from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface ToolbarProps {
  children: React.ReactNode;
  className?: string;
}

function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b px-4 py-2",
        className
      )}
    >
      {children}
    </div>
  );
}

export interface ToolbarSectionProps {
  children: React.ReactNode;
  className?: string;
}

function ToolbarSection({ children, className }: ToolbarSectionProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {children}
    </div>
  );
}

function ToolbarSeparator() {
  return <Separator orientation="vertical" className="h-6" />;
}

export { Toolbar, ToolbarSection, ToolbarSeparator };
