import * as React from "react";
import { GripVertical, MoreVertical } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface WidgetCardAction {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  /** When true the item is rendered but non-interactive (feature not yet available). */
  disabled?: boolean;
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
    },
    ref
  ) => {
    return (
      <Card ref={ref} className={cn("flex flex-col h-full", className)}>
        {(title || actions || headerExtra) && (
          <CardHeader
            className={cn(
              "flex flex-row items-center justify-between space-y-0 p-4 pb-2",
              headerClassName
            )}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={cn(
                  "drag-handle cursor-grab active:cursor-grabbing touch-none",
                  !draggable && "invisible"
                )}
                onMouseDown={draggable ? onDragHandleMouseDown : undefined}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="sr-only">Drag to reorder</span>
              </button>
              <div>
                {title && (
                  <h3 className="text-sm font-semibold leading-none">{title}</h3>
                )}
                {subtitle && (
                  <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
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
                    <React.Fragment key={index}>
                      {action.destructive && index > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        onClick={action.disabled ? undefined : action.onClick}
                        disabled={action.disabled}
                        className={cn(
                          action.destructive && "text-destructive focus:text-destructive",
                          action.disabled && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {action.label}
                      </DropdownMenuItem>
                    </React.Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              )}
            </div>
          </CardHeader>
        )}
        <CardContent
          className={cn("flex-1 min-h-0 p-4 pt-2 overflow-hidden", contentClassName)}
        >
          {children}
        </CardContent>
      </Card>
    );
  }
);
WidgetCard.displayName = "WidgetCard";

export { WidgetCard };
