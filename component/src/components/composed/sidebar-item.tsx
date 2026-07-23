import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
        // Expose the active nav item to assistive tech — the border/bg/weight
        // change is visual-only otherwise. (#component-review)
        aria-current={active ? "page" : undefined}
        className={cn(
          // 2px transparent left border in every state so activation never
          // shifts layout — only the border/background colors change (#826).
          "flex w-full items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-[color,background-color,border-color] duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "hover:bg-accent-soft hover:text-foreground",
          active &&
            "border-[hsl(var(--ring))] bg-accent-soft font-medium text-foreground",
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
              // Subdued right-aligned count — quieter than a filled badge (#826)
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {badge}
              </span>
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

export interface SidebarSectionLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Section heading, conventionally short and shouty: WORKSPACE, ADMIN. */
  label: string;
  /** Hidden entirely when the sidebar is collapsed to icons. */
  collapsed?: boolean;
}

/**
 * Small uppercase group label separating sidebar nav sections (#826).
 */
const SidebarSectionLabel = ({
  label,
  collapsed = false,
  className,
  ...rest
}: SidebarSectionLabelProps) => {
  if (collapsed) return null;
  return (
    <div
      className={cn(
        "px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground/70",
        className,
      )}
      {...rest}
    >
      {label}
    </div>
  );
};

export { SidebarSectionLabel };

export interface WordmarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Icon-only form for collapsed sidebars. */
  collapsed?: boolean;
}

/**
 * NeoBoard text wordmark (#834): Geist Sans, dual weight (Neo medium /
 * Board semibold), tight tracking, anchored by a citrine square. The
 * collapsed form keeps just the mark + "N".
 */
const Wordmark = ({ collapsed = false, className, ...rest }: WordmarkProps) => (
  <span
    className={cn(
      "inline-flex items-center gap-2 font-display text-lg tracking-tight",
      collapsed && "justify-center",
      className,
    )}
    {...rest}
  >
    <span
      aria-hidden
      className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-[hsl(var(--brand))]"
    />
    {collapsed ? (
      <span className="font-semibold">N</span>
    ) : (
      <span>
        <span className="font-medium">Neo</span>
        <span className="font-semibold">Board</span>
      </span>
    )}
  </span>
);

export { Wordmark };
