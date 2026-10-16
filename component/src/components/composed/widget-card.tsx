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
    // The bar sits on the panel's own tint: it follows the hover fill instead
    // of painting a rectangle of its own.
    const iconButton = cn(
      "h-7 w-7 rounded-sm text-foreground-2",
      overlay && "border border-rule-strong bg-inherit",
    );
    const controls =
      Number(Boolean(onRefresh && !folded)) +
      Number(Boolean(onFullscreen && !folded)) +
      Number(Boolean(headerExtra)) +
      Number(hasMenu);
    // 28 px buttons, 2 px gaps, 8 px from the edge.
    const reserved = controls * 30 + 8;
    const hasHeader =
      title || hasMenu || headerExtra || onRefresh || onFullscreen;
    return (
      <Panel
        ref={ref}
        className={cn(
          "group/panel flex h-full flex-col",
          // View mode tints the hovered panel, so the revealed actions read
          // as its own. Edit mode keeps every control visible: no tint.
          draggable
            ? "border-rule-strong"
            : "hover:bg-side focus-within:bg-side",
          className,
        )}
      >
        {hasHeader && (
          <PanelHeader
            data-widget-header
            className={cn(
              "relative block space-y-0 px-4 pb-0 pt-0",
              headerClassName,
            )}
          >
            {/* One fixed 36 px row: handle, title and controls share a centre
                line (#2219). The source line is reserved below it (#1246). */}
            <div
              data-widget-row
              className="flex h-9 items-center justify-between gap-2"
            >
              <div
                className="flex min-w-0 flex-1 items-center gap-2"
                // Room for controls that stay in view (edit mode, touch).
                style={{ paddingRight: overlay ? undefined : reserved }}
              >
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
                    action buttons off the card. `title` gives the clipped text
                    back as a tooltip (#2056). */}
                {title && (
                  <h3
                    className="min-w-0 truncate text-widget-title"
                    title={title}
                  >
                    {title}
                  </h3>
                )}
              </div>
              {/* Hidden at rest with opacity only, never display or
                  visibility, so Tab and the accessibility tree still reach the
                  controls. Where any input is coarse (a touchscreen laptop that
                  reports hover), an invisible button takes no tap until the
                  panel is hovered or focused; a fine pointer stays clickable
                  at rest so scripted clicks reach it. */}
              <div
                className={cn(
                  // Absolute in every mode: a bar that flips between static and
                  // absolute on the edit toggle suppresses Chromium's scroll
                  // anchoring, and the page jumps (#1163).
                  "absolute right-2 top-1 z-10 flex items-center gap-0.5",
                  overlay &&
                    "[@media(any-pointer:coarse)]:pointer-events-none rounded-sm bg-card opacity-0 transition-opacity [transition-duration:var(--duration-fast)] group-focus-within/panel:pointer-events-auto group-focus-within/panel:bg-side group-focus-within/panel:opacity-100 group-hover/panel:pointer-events-auto group-hover/panel:bg-side group-hover/panel:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100",
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className={iconButton}
                      >
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
            </div>
            {source ? (
              <p
                className="truncate text-meta leading-4 text-muted-foreground"
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
                <p data-source-placeholder aria-hidden="true" className="h-4" />
              )
            )}
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
