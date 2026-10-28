"use client";

import * as React from "react";
import { ArrowRight, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  /** Where the filter is set, e.g. "on Overview". */
  where?: string;
  /** Jumps to the selector that sets the filter. */
  onSelect?: () => void;
}

export interface FiltersButtonProps {
  /** Every filter on the dashboard, set or not. */
  items: readonly FiltersButtonItem[];
  onClear: (id: string) => void;
  onClearAll: () => void;
  /** Whether the filter bar under the header is shown; defaults to shown. */
  barShown?: boolean;
  /** Called by the "Show filter bar" switch; without it the switch is left out. */
  onShowChange?: (shown: boolean) => void;
}

/** More filters than this and the list gets a search box. */
const SEARCH_ABOVE = 8;

function FilterRow({
  item: i,
  onClose,
  onClear,
}: Readonly<{
  item: FiltersButtonItem;
  onClose: () => void;
  onClear: (id: string) => void;
}>) {
  const value = i.value ?? "Any";
  return (
    <li
      key={i.id}
      // One fixed value column in every row, so values line up; the jump
      // button is stretched over the row (its ::after) and the × sits above it.
      className="relative grid grid-cols-[minmax(0,1fr)_8.5rem_1.25rem_1rem] items-center gap-x-2 border-b border-card-edge px-3 py-2 hover:bg-active"
    >
      <button
        type="button"
        data-filter-id={i.id}
        aria-label={`Go to ${i.label} selector${i.where ? ` ${i.where}` : ""}`}
        onClick={() => {
          onClose();
          i.onSelect?.();
        }}
        className="truncate text-left text-sm font-medium focus-visible:outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
      >
        {i.label}
      </button>
      <span
        data-filter-value
        title={value}
        className={`truncate text-sm${i.value === undefined ? " text-muted-foreground" : ""}`}
      >
        {value}
      </span>
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
          className="relative z-10 col-start-3 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
      <ArrowRight
        data-filter-arrow
        aria-hidden
        className="col-start-4 h-4 w-4 text-muted-foreground"
      />
      {i.where && (
        <span className="col-span-4 text-xs text-muted-foreground">
          {i.where}
        </span>
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
  barShown = true,
  onShowChange,
}: Readonly<FiltersButtonProps>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const clearedId = React.useRef<string | null>(null);
  const headingId = React.useId();
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
    {
      key: "set",
      name: "Set",
      rows: matches.filter((i) => i.value !== undefined),
    },
    {
      key: "unset",
      name: "Not set",
      rows: matches.filter((i) => i.value === undefined),
    },
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
        <div
          data-testid="filters-scroll"
          className="max-h-[300px] overflow-y-auto border-t border-card-edge"
        >
          {groups.map((g) => (
            <React.Fragment key={g.key}>
              <p
                id={`${headingId}-${g.key}`}
                className="m-0 px-3 pb-0.5 pt-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                {g.name}
              </p>
              <ul
                aria-labelledby={`${headingId}-${g.key}`}
                className="m-0 list-none p-0"
              >
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
              </ul>
            </React.Fragment>
          ))}
          {groups.length === 0 && (
            <p className="m-0 px-3 py-2 text-sm text-muted-foreground">
              No filter matches
            </p>
          )}
        </div>
        <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
          {onShowChange ? (
            <label className="flex items-center gap-2">
              <Switch checked={barShown} onCheckedChange={onShowChange} />
              Show filter bar
            </label>
          ) : (
            <span />
          )}
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
