import * as React from "react";
import { GripVertical, MoreVertical, RefreshCcw } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface WidgetCardAction {
  label: string;
  /**
   * Click handler. Omit when `children` is set — the entry becomes a submenu
   * parent and clicks open the submenu instead of firing a callback.
   */
  onClick?: () => void;
  destructive?: boolean;
  /** When true the item is rendered but non-interactive (feature not yet available). */
  disabled?: boolean;
  /**
   * Nested actions. When present the entry renders as a Radix submenu
   * (DropdownMenuSub → SubTrigger → SubContent). Use for grouping related
   * actions like "Export ▸ CSV / PNG / SVG" (#912).
   */
  children?: WidgetCardAction[];
}

export interface WidgetCardProps {
  title?: string;
  subtitle?: string;
  actions?: WidgetCardAction[];
  draggable?: boolean;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
  onDragHandleMouseDown?: React.MouseEventHandler;
  /** Extra elements rendered in the header before the actions dropdown */
  headerExtra?: React.ReactNode;
  /** When provided, renders a refresh icon button in the header that calls this callback. */
  onRefresh?: () => void;
  /** Keeps the refresh control visible but non-interactive. */
  refreshDisabled?: boolean;
}

const WidgetCard = React.forwardRef<HTMLDivElement, WidgetCardProps>(
  (
    {
      title,
      subtitle,
      actions,
      draggable = false,
      className,
      headerClassName,
      contentClassName,
      children,
      onDragHandleMouseDown,
      headerExtra,
      onRefresh,
      refreshDisabled = false,
    },
    ref,
  ) => {
    return (
      <Card ref={ref} className={cn("flex flex-col h-full", className)}>
        {(title || actions || headerExtra || onRefresh) && (
          <CardHeader
            className={cn(
              "flex flex-row items-center justify-between space-y-0 p-4 pb-2",
              headerClassName,
            )}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={cn(
                  "drag-handle cursor-grab active:cursor-grabbing touch-none",
                  !draggable && "invisible",
                )}
                onMouseDown={draggable ? onDragHandleMouseDown : undefined}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="sr-only">Drag to reorder</span>
              </button>
              <div>
                {title && (
                  <h3 className="text-sm font-semibold leading-none">
                    {title}
                  </h3>
                )}
                {subtitle && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {onRefresh && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onRefresh}
                  disabled={refreshDisabled}
                >
                  <RefreshCcw className="h-4 w-4" />
                  <span className="sr-only">Refresh</span>
                </Button>
              )}
              {headerExtra}
              {actions && actions.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">Widget actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {actions.map((action, index) => (
                      <React.Fragment key={`${action.label}-${index}`}>
                        {action.destructive && index > 0 && (
                          <DropdownMenuSeparator />
                        )}
                        {action.children && action.children.length > 0 ? (
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger
                              disabled={action.disabled}
                              className={cn(
                                action.disabled &&
                                  "opacity-50 cursor-not-allowed",
                              )}
                            >
                              {action.label}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {action.children.map((child) => (
                                <DropdownMenuItem
                                  key={child.label}
                                  onClick={
                                    child.disabled ? undefined : child.onClick
                                  }
                                  disabled={child.disabled}
                                  className={cn(
                                    child.destructive &&
                                      "text-destructive focus:text-destructive",
                                    child.disabled &&
                                      "opacity-50 cursor-not-allowed",
                                  )}
                                >
                                  {child.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        ) : (
                          <DropdownMenuItem
                            onClick={
                              action.disabled ? undefined : action.onClick
                            }
                            disabled={action.disabled}
                            className={cn(
                              action.destructive &&
                                "text-destructive focus:text-destructive",
                              action.disabled &&
                                "opacity-50 cursor-not-allowed",
                            )}
                          >
                            {action.label}
                          </DropdownMenuItem>
                        )}
                      </React.Fragment>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </CardHeader>
        )}
        <CardContent
          className={cn(
            "flex-1 min-h-0 p-4 pt-2 overflow-hidden",
            contentClassName,
          )}
        >
          {children}
        </CardContent>
      </Card>
    );
  },
);
WidgetCard.displayName = "WidgetCard";

export { WidgetCard };
