import * as React from "react";
import { cn } from "@/lib/utils";

export interface AppShellProps {
  sidebar?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

function AppShell({ sidebar, header, children, className }: AppShellProps) {
  return (
    <div className={cn("flex h-screen overflow-hidden", className)}>
      {sidebar}
      <div className="flex flex-1 flex-col overflow-hidden">
        {header}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

export { AppShell };
