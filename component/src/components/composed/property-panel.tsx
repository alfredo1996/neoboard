import * as React from "react";
import { cn } from "@/lib/utils";

/** A property value by its JS shape: what the row renders, never a JSON string. */
export type PropertyValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | PropertyValue[]
  | { [key: string]: PropertyValue };

export interface PropertyItem {
  key: string;
  value: PropertyValue;
}

/** Items shown before a list or map collapses behind "+N more". */
const LIST_PREVIEW = 5;
/**
 * A string longer than this is clamped to 4 lines behind "Show more". jsdom
 * cannot measure lines, so length decides: about 4 lines of a narrow inspector
 * (~50 chars each). Ids and short values stay untouched. Ceiling: a short
 * string with many newlines is not clamped.
 */
const STRING_CLAMP_CHARS = 200;

/**
 * Five digits or more get thousands separators (63,000,000); shorter numbers
 * print bare, so a year never reads 1,964.
 */
function formatNumber(value: number): string {
  return Math.abs(value) >= 10000
    ? value.toLocaleString("en-US", { maximumFractionDigits: 20 })
    : String(value);
}

/** A text toggle whose accessible name is its visible text (WCAG 2.5.3). */
function Toggle({
  expanded,
  onToggle,
  more,
  less,
}: Readonly<{
  expanded: boolean;
  onToggle: () => void;
  more: string;
  less: string;
}>) {
  return (
    <button
      type="button"
      className="mt-1 rounded-sm text-meta text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      {expanded ? less : more}
    </button>
  );
}

/** Lists and maps: the first LIST_PREVIEW rows, the rest behind "+N more". */
function Collapsible<T>({
  rows,
  render,
}: Readonly<{ rows: T[]; render: (rows: T[]) => React.ReactNode }>) {
  const [expanded, setExpanded] = React.useState(false);
  const hidden = rows.length - LIST_PREVIEW;
  return (
    <>
      {render(expanded ? rows : rows.slice(0, LIST_PREVIEW))}
      {hidden > 0 && (
        <Toggle
          expanded={expanded}
          onToggle={() => setExpanded((e) => !e)}
          more={`+${hidden} more`}
          less="Show fewer"
        />
      )}
    </>
  );
}

function LongString({ value }: Readonly<{ value: string }>) {
  const [expanded, setExpanded] = React.useState(false);
  if (value.length <= STRING_CLAMP_CHARS) return <>{value}</>;
  return (
    <>
      <span
        data-testid="property-text"
        className={cn("block", !expanded && "line-clamp-4")}
      >
        {value}
      </span>
      <Toggle
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
        more="Show more"
        less="Show less"
      />
    </>
  );
}

function ValueView({ value }: Readonly<{ value: PropertyValue }>) {
  if (value === undefined) return <>-</>;
  if (value === null)
    return <span className="text-muted-foreground">null</span>;
  if (value === "")
    return <span className="text-muted-foreground">(empty)</span>;
  if (typeof value === "string") return <LongString value={value} />;
  if (typeof value === "number") return <>{formatNumber(value)}</>;
  if (typeof value !== "object") return <>{String(value)}</>;
  if (Array.isArray(value)) {
    if (value.length === 0)
      return <span className="text-muted-foreground">(empty list)</span>;
    return (
      <Collapsible
        rows={value}
        render={(shown) => (
          <ul className="space-y-0.5 [&_ul]:border-l [&_ul]:border-border [&_ul]:pl-2">
            {shown.map((v, i) => (
              // Items have no identity and may repeat; position plus a scalar
              // fingerprint is stable for a read-only list.
              <li key={`${i}:${typeof v === "object" ? "" : String(v)}`}>
                <ValueView value={v} />
              </li>
            ))}
          </ul>
        )}
      />
    );
  }
  const entries = Object.entries(value);
  if (entries.length === 0)
    return <span className="text-muted-foreground">(empty map)</span>;
  return (
    <Collapsible
      rows={entries}
      render={(shown) => (
        <div className="space-y-0.5 border-l border-border pl-2">
          {shown.map(([k, v]) => (
            <div key={k}>
              <span className="text-muted-foreground">{k}: </span>
              <ValueView value={v} />
            </div>
          ))}
        </div>
      )}
    />
  );
}

/** The text a copy button writes for a value: strings as is, structures as JSON. */
export function propertyRawText(value: PropertyValue): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * What a scalar shows, so its width can be measured; null for a list or map
 * with content, which always reads under its key.
 */
function scalarText(value: PropertyValue): string | null {
  if (value === undefined) return "-";
  if (value === null) return "null";
  if (value === "") return "(empty)";
  if (typeof value === "string") return value;
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length === 0 ? "(empty list)" : null;
  return Object.keys(value).length === 0 ? "(empty map)" : null;
}

/** Row geometry, mirrored from the grid below: key column, copy slot, gaps. */
const KEY_MIN = 72;
const KEY_SHARE = 0.36;
const COPY_SLOT = 24;
const GAPS = 20;
const ROW_PADDING = 12;

/** A value reads beside its key only if its one-line width fits the column. */
function fitsBesideKey(textWidth: number, rowWidth: number): boolean {
  const inner = rowWidth - ROW_PADDING;
  const room = inner - Math.max(KEY_MIN, inner * KEY_SHARE) - COPY_SLOT - GAPS;
  return textWidth <= room;
}

function PropertyRow({
  item,
  action,
}: Readonly<{ item: PropertyItem; action?: React.ReactNode }>) {
  const rowRef = React.useRef<HTMLDivElement>(null);
  const sizerRef = React.useRef<HTMLSpanElement>(null);
  const text = scalarText(item.value);
  const [fits, setFits] = React.useState(true);

  React.useLayoutEffect(() => {
    const row = rowRef.current;
    const sizer = sizerRef.current;
    if (!row || !sizer) return;
    const measure = () =>
      setFits(fitsBesideKey(sizer.offsetWidth, row.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [text]);

  const wide = text === null || !fits;

  return (
    <div
      ref={rowRef}
      data-testid="property-row"
      data-wide={wide}
      className="group relative -mx-1.5 grid grid-cols-[minmax(72px,36%)_minmax(0,1fr)_24px] items-start gap-x-2.5 rounded px-1.5 py-1 hover:bg-muted"
    >
      <div
        data-testid="property-key"
        className="pt-0.5 text-meta text-muted-foreground [overflow-wrap:anywhere]"
      >
        {item.key}
      </div>
      <div
        data-testid="property-value"
        className={cn(
          "min-w-0 text-body [overflow-wrap:anywhere]",
          wide
            ? "col-span-3 col-start-1 row-start-2"
            : "col-start-2 row-start-1",
        )}
      >
        <ValueView value={item.value} />
      </div>
      <div className="col-start-3 row-start-1">{action}</div>
      {text !== null && (
        // Measures the value on one line, whichever layout it is in now.
        <span
          ref={sizerRef}
          aria-hidden="true"
          data-text={text}
          className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap text-body before:content-[attr(data-text)]"
        />
      )}
    </div>
  );
}

export interface PropertyPanelProps {
  items: PropertyItem[];
  /** The slot at the end of a row (a copy button). */
  renderAction?: (item: PropertyItem) => React.ReactNode;
  className?: string;
}

/** One list of properties, keys A to Z; a value that does not fit beside its key reads under it. */
function PropertyPanel({
  items,
  renderAction,
  className,
}: Readonly<PropertyPanelProps>) {
  const sorted = React.useMemo(
    () => [...items].sort((a, b) => a.key.localeCompare(b.key)),
    [items],
  );
  return (
    <div className={cn(className)}>
      {sorted.map((item) => (
        <PropertyRow key={item.key} item={item} action={renderAction?.(item)} />
      ))}
    </div>
  );
}

export { PropertyPanel };
