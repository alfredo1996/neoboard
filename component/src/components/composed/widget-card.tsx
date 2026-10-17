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
   * "edit" shows the drag handle, keeps every control visible and draws a
   * dashed, shadowless edge. In "view" the controls fade in on hover or focus
   * (#2219, #2247).
   */
  mode?: "view" | "edit";
  /** The title face. Sans is the approved look (#2247). */
  titleFont?: "sans" | "serif";
  /** The hairline between header and body. */
  headerRule?: boolean;
  /** The card's shadow. Edit mode never has one. */
  elevation?: boolean;
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

// The bar's metrics, in px and as the Tailwind classes that draw them. The
// title row reserves room from the px values when the controls stay in view,
// so change both together (a unit test pins the arithmetic).
const BUTTON_PX = 28;
const BUTTON_SIZE_CLASS = "h-7 w-7";
const BAR_GAP_PX = 2;
const BAR_GAP_CLASS = "gap-0.5";
const BAR_EDGE_PX = 10;
const BAR_EDGE_CLASS = "right-2.5";

/** What the header shows and where: from the mode, the pointer and the controls given. */
function headerLayout(p: {
  readonly mode: "view" | "edit";
  readonly touch: boolean;
  readonly hasActions: boolean;
  readonly title?: string;
  readonly headerExtra?: React.ReactNode;
  readonly onRefresh?: unknown;
  readonly onFullscreen?: unknown;
}) {
  const draggable = p.mode === "edit";
  // Touch folds Refresh and Fullscreen into the menu; edit mode never folds.
  const folded = p.touch && !draggable;
  // Edit mode and touch keep the controls in the row. Otherwise they overlay
  // the header's right end, so a title gets the full width at rest.
  const overlay = !draggable && !p.touch;
  const hasFolded = folded && Boolean(p.onRefresh || p.onFullscreen);
  const hasMenu = p.hasActions || hasFolded;
  const controls =
    Number(Boolean(p.onRefresh && !folded)) +
    Number(Boolean(p.onFullscreen && !folded)) +
    Number(Boolean(p.headerExtra)) +
    Number(hasMenu);
  return {
    draggable,
    folded,
    overlay,
    hasFolded,
    hasMenu,
    reserved: controls * (BUTTON_PX + BAR_GAP_PX) + BAR_EDGE_PX,
    hasHeader: Boolean(
      p.title || hasMenu || p.headerExtra || p.onRefresh || p.onFullscreen,
    ),
  };
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
      mode = "view",
      titleFont = "sans",
      headerRule = true,
      elevation = true,
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
    const hasActions = Boolean(actions?.length);
    const {
      draggable,
      folded,
      overlay,
      hasFolded,
      hasMenu,
      reserved,
      hasHeader,
    } = headerLayout({
      mode,
      touch,
      hasActions,
      title,
      headerExtra,
      onRefresh,
      onFullscreen,
    });
    const iconButton = cn(
      BUTTON_SIZE_CLASS,
      "rounded-sm text-foreground-2",
      overlay && "border border-rule-strong",
    );
    return (
      <Panel
        ref={ref}
        data-title-font={titleFont}
        className={cn(
          "group/panel flex h-full flex-col",
          // Edit mode: a dashed strong edge, no shadow, no hover darkening.
          draggable
            ? "border-dashed border-rule-strong shadow-none hover:border-rule-strong focus-within:border-rule-strong"
            : !elevation && "shadow-none",
          className,
        )}
      >
        {hasHeader && (
          <PanelHeader
            data-widget-header
            className={cn(
              "relative block space-y-0 border-b px-4 pb-2.5 pt-3",
              headerRule ? "border-rule" : "border-transparent",
              headerClassName,
            )}
          >
            {/* Edit mode: one fixed 36 px row, so handle, title and controls
                share a centre line (#2219). View mode: the title's own line.
                The source line is reserved below it (#1246). */}
            <div
              data-widget-row
              className={cn(
                "flex items-center justify-between gap-2",
                draggable && "h-9",
              )}
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
                    className={cn(
                      "min-w-0 truncate text-widget-title",
                      titleFont === "serif"
                        ? "font-serif text-base font-semibold leading-[1.3]"
                        : "font-body",
                    )}
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
                  `absolute ${BAR_EDGE_CLASS} ${draggable ? "top-3.5" : "top-2.5"} z-10 flex items-center ${BAR_GAP_CLASS}`,
                  overlay &&
                    "[@media(any-pointer:coarse)]:pointer-events-none rounded-sm bg-card opacity-0 transition-opacity [transition-duration:var(--duration-fast)] group-focus-within/panel:pointer-events-auto group-focus-within/panel:opacity-100 group-hover/panel:pointer-events-auto group-hover/panel:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100",
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
                className="mt-[3px] truncate text-meta leading-4 text-muted-foreground"
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
                  className="mt-[3px] h-4"
                />
              )
            )}
          </PanelHeader>
        )}
        <PanelContent
          className={cn(
            "flex-1 min-h-0 overflow-hidden px-4 pb-4 pt-3",
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
