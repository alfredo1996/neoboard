"use client";

import * as React from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface FiltersButtonItem {
  id: string;
  /** The selector's title. */
  label: string;
  /** The value that is set; left out when the filter is unset ("Any"). */
  value?: string;
  /** Where the filter is set, e.g. "Decade selector · Overview". */
  where?: string;
  /** Jumps to the selector that sets the filter. */
  onSelect?: () => void;
}

export interface FiltersButtonProps {
  /** Every filter on the dashboard, set or not. */
  items: readonly FiltersButtonItem[];
  onClear: (id: string) => void;
  onClearAll: () => void;
}

/** More filters than this and the list gets a search box. */
const SEARCH_ABOVE = 8;

/** A long value wraps inside 14rem; it never squeezes the name to nothing. */
const valueClass = (value?: string) =>
  `max-w-56 break-words text-sm${value === undefined ? " text-muted-foreground" : ""}`;

function FilterRow({
  item: i,
  onClose,
  onClear,
}: Readonly<{
  item: FiltersButtonItem;
  onClose: () => void;
  onClear: (id: string) => void;
}>) {
  return (
    <li
      key={i.id}
      className="flex items-center gap-2 border-b border-card-edge px-3 py-2 hover:bg-hover"
    >
      <button
        type="button"
        data-filter-id={i.id}
        onClick={() => {
          onClose();
          i.onSelect?.();
        }}
        className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate text-sm font-medium">{i.label}</span>
        <span className={valueClass(i.value)}>{i.value ?? "Any"}</span>
        {i.where && (
          <span className="col-span-2 text-xs text-muted-foreground">
            {i.where}
          </span>
        )}
      </button>
      {i.value !== undefined && (
        <button
          type="button"
          aria-label={`Clear ${i.label}`}
          onClick={(e) => {
            // The row turns into "Any" and may move to another group, which
            // remounts it: the parent refocuses it once the items change.
            e.currentTarget.parentElement?.querySelector("button")?.focus();
            onClear(i.id);
          }}
          className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-muted-foreground hover:bg-active hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </li>
  );
}

/**
 * The header's Filters button (#2297): a count of the filters that are set and
 * a list of every filter on the dashboard, set ones first, unset ones as "Any".
 * The list scrolls past about seven rows.
 */
function FiltersButton({
  items,
  onClear,
  onClearAll,
}: Readonly<FiltersButtonProps>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const clearedId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (clearedId.current === null) return;
    document
      .querySelector<HTMLElement>(
        `[data-filter-id="${CSS.escape(clearedId.current)}"]`,
      )
      ?.focus();
    clearedId.current = null;
  }, [items]);
  if (items.length === 0) return null;

  const setCount = items.filter((i) => i.value !== undefined).length;
  const needle = query.trim().toLowerCase();
  const matches = items.filter(
    (i) =>
      !needle || `${i.label} ${i.value ?? ""}`.toLowerCase().includes(needle),
  );
  const groups = [
    { name: "Set", rows: matches.filter((i) => i.value !== undefined) },
    { name: "Not set", rows: matches.filter((i) => i.value === undefined) },
  ].filter((g) => g.rows.length > 0);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden />
          Filters
          {setCount > 0 && (
            <span
              aria-label={`${setCount} set`}
              className="ml-2 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-semibold text-card"
            >
              {setCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Filters"
        className="w-[380px] max-w-[calc(100vw-48px)] p-0"
      >
        <div className="flex items-baseline justify-between px-3 pb-2 pt-2.5">
          <b className="text-sm">Filters</b>
          <span className="text-xs text-muted-foreground">
            {setCount} of {items.length} set
          </span>
        </div>
        {items.length > SEARCH_ABOVE && (
          <input
            type="search"
            aria-label="Find a filter"
            placeholder="Find a filter"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mx-3 mb-2 h-[30px] w-[calc(100%-24px)] rounded-md border border-rule-strong bg-card px-2.5 text-sm"
          />
        )}
        <ul className="m-0 max-h-[300px] list-none overflow-y-auto border-t border-card-edge p-0">
          {groups.map((g) => (
            <React.Fragment key={g.name}>
              <li
                role="presentation"
                className="px-3 pb-0.5 pt-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                {g.name}
              </li>
              {g.rows.map((i) => (
                <FilterRow
                  key={i.id}
                  item={i}
                  onClose={() => setOpen(false)}
                  onClear={(id) => {
                    clearedId.current = id;
                    onClear(id);
                  }}
                />
              ))}
            </React.Fragment>
          ))}
          {groups.length === 0 && (
            <li
              role="presentation"
              className="px-3 py-2 text-sm text-muted-foreground"
            >
              No filter matches
            </li>
          )}
        </ul>
        <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
          <span>Click a filter to go to its selector</span>
          <button
            type="button"
            onClick={onClearAll}
            className="text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear all
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { FiltersButton };
