import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import {
  PropertyPanel,
  propertyRawText,
  type PropertyItem,
} from "./property-panel";

/** One end of a relationship. */
export interface InspectorEnd {
  id: string;
  name: string;
}

export type InspectorElement =
  | {
      kind: "node";
      id: string;
      /** The id the database gave it; none, no "Element id" row. */
      databaseId?: string;
      /** What the canvas hover shows for the node. */
      title: string;
      /** The node's legend colour, as a CSS colour. */
      color?: string;
      labels: string[];
      properties: PropertyItem[];
    }
  | {
      kind: "relationship";
      id: string;
      /** The id the database gave it; none, no "Element id" row. */
      databaseId?: string;
      /** The relationship's type. */
      title: string;
      source: InspectorEnd;
      target: InspectorEnd;
      /** Ids of every relationship between these two nodes, this one included. */
      siblings: string[];
      properties: PropertyItem[];
    };

/** A relationship of the inspected node, seen from it. */
export interface InspectorConnection {
  /** The relationship's id. */
  id: string;
  type: string;
  /** "to": it leaves the node; "from": it arrives. */
  direction: "from" | "to";
  otherId: string;
  otherName: string;
}

export interface GraphInspectorProps {
  element: InspectorElement;
  /** What "Copy" writes: the element as pretty-printed JSON. */
  elementJson: string;
  /** The side it docks to, kept while it is open. */
  side: "left" | "right";
  /** Its width in px (see {@link graphInspectorWidth}). */
  width: number;
  /** A node's relationships already on the graph. */
  connections?: InspectorConnection[];
  onClose: () => void;
  onSelectNode: (id: string) => void;
  onSelectRelationship: (id: string) => void;
  /** Something was copied: `what` completes "Copied …". */
  onCopied?: (what: string) => void;
  /** The browser refused the write; the text is on screen, selected. */
  onCopyBlocked?: () => void;
  className?: string;
}

/**
 * A third of the graph, clamped to 280–380 px and never more than half of it
 * (263 px on a 560 px tile, 380 px expanded). 280 before the graph is measured.
 */
export function graphInspectorWidth(graphWidth: number): number {
  if (!graphWidth) return 280;
  return Math.min(380, Math.max(graphWidth / 3, Math.min(280, graphWidth / 2)));
}

/** Under this width the header's Copy is an icon, so the title keeps room. */
const NARROW_PANEL = 240;

/** Rows shown in a connection group before "+N more". */
const GROUP_PREVIEW = 5;

const rowCopyClass =
  "h-6 w-6 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100";

/**
 * A titled part of the panel: the title row is the toggle, the count stays
 * beside it. The content is only hidden, so `aria-controls` always resolves.
 */
function Disclosure({
  title,
  count,
  defaultOpen = true,
  className,
  headingClassName,
  children,
  ...rest
}: Readonly<{
  title: string;
  count: string;
  defaultOpen?: boolean;
  className?: string;
  headingClassName?: string;
  children: React.ReactNode;
}> &
  React.HTMLAttributes<HTMLDivElement>) {
  const [open, setOpen] = React.useState(defaultOpen);
  const id = React.useId();
  return (
    <div className={className} {...rest}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          headingClassName,
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <span>{title}</span>{" "}
        <span className="text-xs font-normal text-muted-foreground">
          {count}
        </span>
      </button>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

interface Group {
  key: string;
  type: string;
  direction: "from" | "to";
  rows: InspectorConnection[];
}

function groupConnections(connections: InspectorConnection[]): Group[] {
  const groups = new Map<string, Group>();
  for (const c of connections) {
    const key = `${c.type}|${c.direction}`;
    const group = groups.get(key) ?? {
      key,
      type: c.type,
      direction: c.direction,
      rows: [],
    };
    group.rows.push(c);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.type.localeCompare(b.type) || a.direction.localeCompare(b.direction),
  );
}

function ConnectionGroup({
  group,
  onSelect,
}: Readonly<{ group: Group; onSelect: (id: string) => void }>) {
  const [expanded, setExpanded] = React.useState(false);
  const hidden = group.rows.length - GROUP_PREVIEW;
  const shown = expanded ? group.rows : group.rows.slice(0, GROUP_PREVIEW);
  return (
    <Disclosure
      data-testid="connection-group"
      data-group={group.key}
      className="mt-1.5"
      headingClassName="pb-0.5 pt-1 text-xs font-medium text-foreground-2"
      title={group.type}
      count={String(group.rows.length)}
    >
      {shown.map((row) => {
        const same = group.rows.filter((r) => r.otherId === row.otherId);
        const order =
          same.length > 1 ? `${same.indexOf(row) + 1} of ${same.length}` : "";
        const label = `${group.type} ${group.direction} ${row.otherName}`;
        return (
          <button
            key={row.id}
            type="button"
            aria-label={order ? `${label}, ${order}` : label}
            onClick={() => onSelect(row.id)}
            className="-mx-1.5 flex w-[calc(100%+12px)] items-baseline gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="w-[30px] shrink-0 text-xs text-muted-foreground">
              {group.direction}
            </span>
            <span className="min-w-0 text-ring [overflow-wrap:anywhere]">
              {row.otherName}
            </span>
            {order && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {order}
              </span>
            )}
          </button>
        );
      })}
      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 rounded-sm text-xs font-medium text-ring hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? "Show fewer" : `+${hidden} more`}
        </button>
      )}
    </Disclosure>
  );
}

function EndLink({
  end,
  onSelect,
}: Readonly<{ end: InspectorEnd; onSelect: (id: string) => void }>) {
  return (
    <button
      type="button"
      onClick={() => onSelect(end.id)}
      className="rounded-sm font-medium text-ring [overflow-wrap:anywhere] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {end.name}
    </button>
  );
}

/**
 * The panel docked beside a graph for the node or relationship being looked
 * at. Presentational: the element, its connections and what to do on a click
 * come in as props.
 */
function GraphInspector({
  element,
  elementJson,
  side,
  width,
  connections,
  onClose,
  onSelectNode,
  onSelectRelationship,
  onCopied,
  onCopyBlocked,
  className,
}: Readonly<GraphInspectorProps>) {
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  const boxRef = React.useRef<HTMLTextAreaElement>(null);
  // Set by a step, so the arrow keeps focus; any other change of element
  // (a select) moves focus to the title.
  const steppedRef = React.useRef(false);
  const [fallback, setFallback] = React.useState<string | null>(null);
  const isNode = element.kind === "node";
  const kind = isNode ? "Node" : "Relationship";
  // A node and a relationship can share an id (another connector's "1").
  const identity = `${element.kind}:${element.id}`;

  // Opening, and selecting another element, moves focus to the title; the
  // box of a blocked copy belongs to the element it was raised for.
  React.useEffect(() => {
    setFallback(null);
    if (steppedRef.current) {
      steppedRef.current = false;
      return;
    }
    titleRef.current?.focus({ preventScroll: true });
  }, [identity]);

  React.useEffect(() => {
    if (fallback === null) return;
    boxRef.current?.focus({ preventScroll: true });
    boxRef.current?.select();
  }, [fallback]);

  const blocked = (text: string) => () => {
    setFallback(text);
    onCopyBlocked?.();
  };

  const siblings = element.kind === "relationship" ? element.siblings : [];
  const at = siblings.indexOf(element.id);
  const step = (delta: number) => {
    steppedRef.current = true;
    onSelectRelationship(
      siblings[(at + delta + siblings.length) % siblings.length],
    );
  };

  return (
    <section
      aria-label={`${kind}: ${element.title}`}
      data-testid="graph-inspector"
      // An Esc in here closes the panel only, even inside a dialog.
      data-keeps-escape=""
      data-side={side}
      style={{ width }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onClose();
      }}
      className={cn(
        "absolute inset-y-0 z-20 flex flex-col bg-card text-card-foreground",
        side === "right"
          ? "right-0 border-l border-border"
          : "left-0 border-r border-border",
        className,
      )}
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-1 gap-y-2 border-b border-border py-2.5 pl-4 pr-2">
        <h3
          ref={titleRef}
          tabIndex={-1}
          className="flex min-h-8 items-center gap-2 rounded-sm text-sm font-semibold leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {element.kind === "node" && element.color && (
            <span
              data-testid="graph-inspector-dot"
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: element.color }}
            />
          )}
          <span
            title={element.title}
            className={cn(
              "min-w-0",
              // One word never breaks: it ends in an ellipsis. Words wrap.
              /\s/.test(element.title) ? "line-clamp-2" : "truncate",
            )}
          >
            {element.title}
          </span>
        </h3>
        <div className="flex gap-0.5">
          <CopyButton
            value={elementJson}
            variant="ghost"
            {...(width < NARROW_PANEL
              ? { size: "icon-sm" as const }
              : { label: "Copy" })}
            aria-label={`Copy ${kind.toLowerCase()} as JSON`}
            onCopied={() => onCopied?.(`the ${kind.toLowerCase()} as JSON`)}
            onBlocked={blocked(elementJson)}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close inspector"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="col-span-full -mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <span>{kind}</span>
          {element.kind === "node" &&
            element.labels.map((l) => <Tag key={l}>{l}</Tag>)}
        </div>
        {element.kind === "relationship" && (
          <>
            <p className="col-span-full flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
              <span className="text-muted-foreground">From</span>
              <EndLink end={element.source} onSelect={onSelectNode} />
              <span className="text-muted-foreground">to</span>
              <EndLink end={element.target} onSelect={onSelectNode} />
            </p>
            {siblings.length > 1 && (
              <div className="col-span-full -my-1 -ml-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6"
                  aria-label="Previous relationship between these nodes"
                  onClick={() => step(-1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span aria-live="polite">
                  {`${at + 1} of ${siblings.length} between these nodes`}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6"
                  aria-label="Next relationship between these nodes"
                  onClick={() => step(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </header>

      {fallback !== null && (
        <div
          role="alert"
          className="mx-4 mt-3 grid gap-2 rounded-md border border-border-strong p-3 text-xs text-foreground-2"
        >
          <p>
            The browser blocked the clipboard. The text below is selected: press
            Ctrl+C, or Cmd+C on a Mac.
          </p>
          <Textarea
            ref={boxRef}
            readOnly
            aria-label="Text to copy"
            value={fallback}
            className="h-28 resize-y"
          />
          <Button
            variant="secondary"
            size="sm"
            className="justify-self-start"
            onClick={() => setFallback(null)}
          >
            Done
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-1.5">
        <Disclosure
          key={`properties|${identity}`}
          title="Properties"
          count={String(element.properties.length)}
          headingClassName="pb-1 pt-2 text-sm font-semibold"
        >
          {element.properties.length > 0 ? (
            <PropertyPanel
              key={identity}
              items={element.properties}
              renderAction={(item) => (
                <CopyButton
                  value={propertyRawText(item.value)}
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Copy ${item.key}`}
                  className={rowCopyClass}
                  onCopied={() => onCopied?.(item.key)}
                  onBlocked={blocked(propertyRawText(item.value))}
                />
              )}
            />
          ) : (
            <p className="py-1 text-sm text-muted-foreground">No properties.</p>
          )}
        </Disclosure>

        {element.kind === "node" && connections && (
          <Disclosure
            key={`connections|${identity}`}
            title="Connections"
            count={`${connections.length} on this graph`}
            defaultOpen={false}
            className="mt-2.5 border-t border-border"
            headingClassName="pb-1 pt-3 text-sm font-semibold"
          >
            {connections.length === 0 ? (
              <p className="py-1 text-sm text-muted-foreground">
                None on this graph.
              </p>
            ) : (
              groupConnections(connections).map((g) => (
                <ConnectionGroup
                  key={`${identity}|${g.key}`}
                  group={g}
                  onSelect={onSelectRelationship}
                />
              ))
            )}
          </Disclosure>
        )}

        {element.databaseId !== undefined && (
          <div className="group relative -mx-1.5 mt-3 grid grid-cols-[minmax(72px,36%)_minmax(0,1fr)_24px] items-start gap-x-2.5 border-t border-border px-1.5 pt-2.5">
            <div className="pt-0.5 text-meta text-muted-foreground">
              Element id
            </div>
            <div
              data-testid="graph-inspector-id"
              className="col-span-3 col-start-1 row-start-2 min-w-0 text-xs text-foreground-2 [overflow-wrap:anywhere]"
            >
              {element.databaseId}
            </div>
            <div className="col-start-3 row-start-1">
              <CopyButton
                value={element.databaseId}
                variant="ghost"
                size="icon-sm"
                aria-label="Copy element id"
                className={rowCopyClass}
                onCopied={() => onCopied?.("the element id")}
                onBlocked={blocked(element.databaseId)}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export { GraphInspector };
