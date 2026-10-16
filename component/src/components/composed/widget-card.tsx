import * as React from "react";
import { Ellipsis, GripVertical, Maximize2, RefreshCcw } from "lucide-react";
import { Panel, PanelContent, PanelHeader } from "@/components/ui/panel";
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
import { useHoverNone } from "@/hooks/useHoverNone";

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
  /**
   * Where the data comes from (connection, row count). The line is reserved
   * even when empty, so panels in a row align (#1246).
   */
  source?: string;
  actions?: WidgetCardAction[];
  /**
   * Edit mode: shows the drag handle and keeps every control visible. In view
   * mode the controls fade in on hover or focus (#2219).
   */
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
  /**
   * When provided, renders a fullscreen icon button. Called with that button,
   * or with null when it was chosen from the menu (touch screens), so the
   * caller can hand focus back on close.
   */
  onFullscreen?: (opener: HTMLElement | null) => void;
  /** Keeps the refresh control visible but non-interactive. */
  refreshDisabled?: boolean;
}

function ActionItems({ actions }: { readonly actions: WidgetCardAction[] }) {
  return actions.map((action, index) => (
    <React.Fragment key={`${action.label}-${index}`}>
      {action.destructive && index > 0 && <DropdownMenuSeparator />}
      {action.children && action.children.length > 0 ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            disabled={action.disabled}
            className={cn(action.disabled && "opacity-50 cursor-not-allowed")}
          >
            {action.label}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {action.children.map((child) => (
              <DropdownMenuItem
                key={child.label}
                onClick={child.disabled ? undefined : child.onClick}
                disabled={child.disabled}
                className={cn(
                  child.destructive &&
                    "text-destructive focus:text-destructive",
                  child.disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                {child.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : (
        <DropdownMenuItem
          onClick={action.disabled ? undefined : action.onClick}
          disabled={action.disabled}
          className={cn(
            action.destructive && "text-destructive focus:text-destructive",
            action.disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          {action.label}
        </DropdownMenuItem>
      )}
    </React.Fragment>
  ));
}

const WidgetCard = React.forwardRef<HTMLDivElement, WidgetCardProps>(
  (
    {
      title,
      source,
      actions,
      draggable = false,
      className,
      headerClassName,
      contentClassName,
      children,
      onDragHandleMouseDown,
      headerExtra,
      onRefresh,
      onFullscreen,
      refreshDisabled = false,
    },
    ref,
  ) => {
    const touch = useHoverNone();
    // Touch folds Refresh and Fullscreen into the menu; edit mode never folds.
    const folded = touch && !draggable;
    // Edit mode and touch keep the controls in the row. Otherwise they overlay
    // the header's right end, so a title gets the full width at rest.
    const overlay = !draggable && !touch;
    const hasActions = Boolean(actions?.length);
    const hasFolded = folded && Boolean(onRefresh || onFullscreen);
    const hasMenu = hasActions || hasFolded;
    const iconButton = cn(
      "h-7 w-7 rounded-sm text-foreground-2",
      overlay && "border border-rule-strong bg-card",
    );
    return (
      <Panel
        ref={ref}
        className={cn(
          "group/panel flex h-full flex-col",
          // View mode has no border of its own: its outline fills the 1 px
          // gutter, and the neighbour's outline lands on the same pixel (#2219).
          draggable
            ? "rounded-sm border-rule-strong"
            : "rounded-none border-0 outline-1 outline-rule [outline-style:solid]",
          className,
        )}
      >
        {(title || hasMenu || headerExtra || onRefresh || onFullscreen) && (
          <PanelHeader
            data-widget-header
            className={cn(
              "relative flex flex-row items-start justify-between space-y-0 px-4 pb-0 pt-3.5",
              headerClassName,
            )}
          >
            <div className="flex min-w-0 flex-1 items-start gap-2">
              {draggable && (
                <button
                  type="button"
                  className="shrink-0 drag-handle cursor-grab active:cursor-grabbing touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onMouseDown={onDragHandleMouseDown}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="sr-only">Drag to reorder</span>
                </button>
              )}
              {/* min-w-0 + truncate so a long unbroken title doesn't push the
                  action buttons off the card / expand the header. (#component-review)
                  `title` gives the clipped text back as a tooltip (#2056). */}
              <div className="min-w-0">
                {title && (
                  <h3
                    className="truncate text-widget-title leading-4"
                    title={title}
                  >
                    {title}
                  </h3>
                )}
                {source ? (
                  <p
                    className="mt-1.5 truncate text-meta leading-4 text-muted-foreground"
                    title={source}
                  >
                    {source}
                  </p>
                ) : (
                  title && (
                    /* Reserve the source line so titled cards in the same row
                       start their content at the same height — otherwise a card
                       with a source pushes its chart down relative to its
                       neighbour and the row visibly fails to align (#1246).
                       h-4 matches the line-height; empty + aria-hidden
                       because the space carries no meaning. */
                    <p
                      data-source-placeholder
                      aria-hidden="true"
                      className="mt-1.5 h-4"
                    />
                  )
                )}
              </div>
            </div>
            {/* Hidden at rest with opacity only, never display or visibility,
                so Tab and the accessibility tree still reach the controls. */}
            <div
              className={cn(
                "flex items-center gap-0.5",
                overlay
                  ? "absolute right-2 top-2 z-10 rounded-sm bg-card opacity-0 transition-opacity [transition-duration:var(--duration-fast)] group-focus-within/panel:opacity-100 group-hover/panel:opacity-100 has-[[data-state=open]]:opacity-100 [@media(hover:none)]:opacity-100"
                  : "shrink-0",
              )}
            >
              {onRefresh && !folded && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={iconButton}
                  onClick={onRefresh}
                  disabled={refreshDisabled}
                >
                  <RefreshCcw className="h-4 w-4" />
                  <span className="sr-only">Refresh</span>
                </Button>
              )}
              {onFullscreen && !folded && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={iconButton}
                  data-widget-fullscreen
                  onClick={(e) => onFullscreen(e.currentTarget)}
                >
                  <Maximize2 className="h-4 w-4" />
                  <span className="sr-only">Fullscreen</span>
                </Button>
              )}
              {headerExtra}
              {hasMenu && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className={iconButton}>
                      <Ellipsis className="h-4 w-4" />
                      <span className="sr-only">Widget actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {folded && onRefresh && (
                      <DropdownMenuItem
                        onClick={onRefresh}
                        disabled={refreshDisabled}
                      >
                        Refresh
                      </DropdownMenuItem>
                    )}
                    {folded && onFullscreen && (
                      <DropdownMenuItem onClick={() => onFullscreen(null)}>
                        Fullscreen
                      </DropdownMenuItem>
                    )}
                    {hasFolded && hasActions && <DropdownMenuSeparator />}
                    <ActionItems actions={actions ?? []} />
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </PanelHeader>
        )}
        <PanelContent
          className={cn(
            "flex-1 min-h-0 overflow-hidden px-4 pb-4 pt-2",
            contentClassName,
          )}
        >
          {children}
        </PanelContent>
      </Panel>
    );
  },
);
WidgetCard.displayName = "WidgetCard";

export { WidgetCard };
