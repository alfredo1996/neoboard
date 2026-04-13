import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * SidebarItem extends `button` attributes so that consumers using it as a
 * Radix `asChild` target (e.g. `DropdownMenuTrigger asChild`) can pass
 * trigger props directly onto the underlying button via `...rest`, without
 * wrapping it in another `<button>` — which would produce invalid nested
 * button HTML and trigger React hydration warnings.
 */
export interface SidebarItemProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick"
> {
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: string | number;
  collapsed?: boolean;
  onClick?: () => void;
}

const SidebarItem = React.forwardRef<HTMLButtonElement, SidebarItemProps>(
  function SidebarItem(
    {
      icon,
      label,
      active = false,
      badge,
      collapsed = false,
      onClick,
      className,
      ...rest
    },
    ref,
  ) {
    const button = (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          active && "bg-accent text-accent-foreground font-medium",
          collapsed && "justify-center px-0",
          className,
        )}
        {...rest}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-left">{label}</span>
            {badge != null && (
              <Badge
                variant="secondary"
                className="ml-auto h-5 min-w-[20px] px-1 text-xs"
              >
                {badge}
              </Badge>
            )}
          </>
        )}
      </button>
    );

    if (collapsed) {
      return (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return button;
  },
);

export { SidebarItem };
