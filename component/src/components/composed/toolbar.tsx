import * as React from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface ToolbarProps {
  children: React.ReactNode;
  className?: string;
}

function Toolbar({ children, className }: Readonly<ToolbarProps>) {
  return (
    <div
      className={cn(
        // Toolbar and sections wrap rather than run off a narrow viewport (#2056).
        "flex flex-wrap items-center gap-2 border-b px-4 py-2",
        className,
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

function ToolbarSection({
  children,
  className,
}: Readonly<ToolbarSectionProps>) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

function ToolbarSeparator() {
  return <Separator orientation="vertical" className="h-6" />;
}

export { Toolbar, ToolbarSection, ToolbarSeparator };
