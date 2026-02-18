import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

export interface ChartContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface ChartContextMenuGroup {
  items: ChartContextMenuItem[];
}

export interface ChartContextMenuProps {
  groups: ChartContextMenuGroup[];
  children: ReactNode;
  className?: string;
}

function ChartContextMenu({ groups, children, className }: ChartContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn("relative", className)}>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {groups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <ContextMenuSeparator />}
            {group.items.map((item, ii) => (
              <ContextMenuItem
                key={ii}
                onClick={item.onClick}
                disabled={item.disabled}
                className={cn(
                  item.destructive && "text-destructive focus:text-destructive"
                )}
              >
                {item.icon && <span className="mr-2 h-4 w-4">{item.icon}</span>}
                {item.label}
              </ContextMenuItem>
            ))}
          </div>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export { ChartContextMenu };
