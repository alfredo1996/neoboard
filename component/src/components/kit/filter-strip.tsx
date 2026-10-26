"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterStripFilter {
  id: string;
  /** The selector's title, e.g. "Decade". */
  label: string;
  value: string;
  /** Hover text on the chip, e.g. where the value came from. */
  title?: string;
  /** Makes the chip text a button, e.g. to jump to what set the filter. */
  onSelect?: () => void;
}

export interface FilterStripProps {
  filters: readonly FilterStripFilter[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  className?: string;
}

const MAX_VALUE = 24;

function cut(value: string): string {
  return value.length > MAX_VALUE ? `${value.slice(0, MAX_VALUE)}…` : value;
}

const arrowClass =
  "inline-flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border border-rule-strong bg-card text-foreground-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The fade marks the edge that has more to see. */
function fadeMask(more: { before: boolean; after: boolean }): string {
  if (more.after && more.before) {
    return "[mask-image:linear-gradient(90deg,transparent,#000_40px,#000_calc(100%-40px),transparent)]";
  }
  if (more.after) {
    return "[mask-image:linear-gradient(90deg,#000_calc(100%-40px),transparent)]";
  }
  if (more.before)
    return "[mask-image:linear-gradient(90deg,transparent,#000_40px)]";
  return "";
}

const chipButtonClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function StripChip({
  filter: f,
  onRemove,
}: Readonly<{ filter: FilterStripFilter; onRemove: (id: string) => void }>) {
  const name = <span className="text-muted-foreground">{f.label}:</span>;
  const text = (
    <>
      {name} {cut(f.value)}
    </>
  );
  return (
    <li
      title={
        f.title
          ? `${f.label}: ${f.value}\n${f.title}`
          : `${f.label}: ${f.value}`
      }
      className="inline-flex h-[26px] flex-none items-center gap-1 whitespace-nowrap rounded-full border border-rule-strong bg-card pl-2.5 pr-1 text-foreground"
    >
      {f.onSelect ? (
        <button
          type="button"
          onClick={f.onSelect}
          className={`rounded-full hover:underline underline-offset-[3px] ${chipButtonClass}`}
        >
          {text}
        </button>
      ) : (
        <span>{text}</span>
      )}
      <button
        type="button"
        aria-label={`Remove ${f.label} filter`}
        onClick={(e) => {
          // The chip is about to go: hand focus to its neighbour first.
          const li = e.currentTarget.closest("li");
          const next = li?.nextElementSibling ?? li?.previousElementSibling;
          next?.querySelector("button")?.focus();
          onRemove(f.id);
        }}
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-active hover:text-foreground ${chipButtonClass}`}
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </li>
  );
}

/**
 * Active filters as one 44px line under the page header (#2297): "Name: value"
 * chips that scroll sideways instead of wrapping, ‹ › arrows only while there
 * is more to see in that direction, "Clear all" pinned on the right.
 */
function FilterStrip({
  filters,
  onRemove,
  onClearAll,
  className,
}: Readonly<FilterStripProps>) {
  const scroller = React.useRef<HTMLUListElement>(null);
  const [more, setMore] = React.useState({ before: false, after: false });

  const measure = React.useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const before = el.scrollLeft > 1;
    const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setMore((m) =>
      m.before === before && m.after === after ? m : { before, after },
    );
  }, []);

  // Re-measure when the chips change and when the strip is resized.
  React.useLayoutEffect(() => {
    measure();
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, filters]);

  if (filters.length === 0) return null;

  const scrollBy = (dir: 1 | -1) =>
    scroller.current?.scrollBy({
      left: dir * Math.round(scroller.current.clientWidth * 0.8),
      behavior: "smooth",
    });

  return (
    <section
      aria-label="Active filters"
      className={cn(
        "flex h-11 items-center gap-2 border-b border-card-edge text-caption text-foreground-2",
        className,
      )}
    >
      <span className="flex-none">Filtered by</span>
      {more.before && (
        <button
          type="button"
          aria-label="Earlier filters"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => scrollBy(-1)}
          className={arrowClass}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
      <ul
        ref={scroller}
        onScroll={measure}
        className={cn(
          "m-0 flex min-w-0 flex-1 list-none flex-nowrap gap-1.5 overflow-x-auto p-0 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          fadeMask(more),
        )}
      >
        {filters.map((f) => (
          <StripChip key={f.id} filter={f} onRemove={onRemove} />
        ))}
      </ul>
      {more.after && (
        <button
          type="button"
          aria-label="More filters"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => scrollBy(1)}
          className={arrowClass}
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
      <button
        type="button"
        onClick={onClearAll}
        className="flex-none rounded px-1 text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Clear all
      </button>
    </section>
  );
}

export { FilterStrip };
