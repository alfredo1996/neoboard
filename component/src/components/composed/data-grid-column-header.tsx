import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronDown, EyeOff, Filter } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DataGridColumnHeaderProps<
  TData,
  TValue,
> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
  /** Numeric columns right-align their header with the figures under it. */
  align?: "left" | "right";
}

/**
 * The column's name, as the button that opens its menu: sort, filter, hide
 * (#2222). The arrow shows on the sorted column only, a funnel on a filtered
 * one, a chevron on hover and focus.
 */
function DataGridColumnHeader<TData, TValue>({
  column,
  title,
  className,
  align = "left",
}: Readonly<DataGridColumnHeaderProps<TData, TValue>>) {
  const canSort = column.getCanSort();
  const canFilter = column.getCanFilter();
  const canHide = column.getCanHide();
  if (!canSort && !canFilter && !canHide) {
    return <div className={cn("px-2", className)}>{title}</div>;
  }

  const sorted = column.getIsSorted();
  const filter = column.getFilterValue() as string | undefined;
  const SortIcon = sorted === "desc" ? ArrowDown : ArrowUp;

  return (
    <div className={cn(align === "right" && "flex justify-end", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "group/hbtn inline-flex h-8 max-w-full items-center gap-1 rounded px-2 text-xs font-medium",
              "text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              align === "right" && "flex-row-reverse",
            )}
          >
            <span className="truncate">{title}</span>
            {sorted && (
              <SortIcon
                data-sort-icon
                aria-hidden
                className="h-3 w-3 shrink-0 text-foreground"
              />
            )}
            {filter ? (
              <Filter
                data-filtered
                aria-hidden
                className="h-3 w-3 shrink-0 text-foreground"
              />
            ) : null}
            <ChevronDown
              aria-hidden
              className="h-3 w-3 shrink-0 opacity-0 group-hover/hbtn:opacity-100 group-focus-visible/hbtn:opacity-100 group-data-[state=open]/hbtn:opacity-100"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align === "right" ? "end" : "start"}>
          {canSort && (
            <>
              <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
                <ArrowUp className="text-muted-foreground" />
                Sort ascending
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
                <ArrowDown className="text-muted-foreground" />
                Sort descending
              </DropdownMenuItem>
              {sorted && (
                <DropdownMenuItem inset onClick={() => column.clearSorting()}>
                  Clear sort
                </DropdownMenuItem>
              )}
            </>
          )}
          {canFilter && (
            <>
              {canSort && <DropdownMenuSeparator />}
              <div className="px-1 py-1">
                <Input
                  type="text"
                  size="sm"
                  value={filter ?? ""}
                  onChange={(e) =>
                    column.setFilterValue(e.target.value || undefined)
                  }
                  // The menu's typeahead and roving focus would take the
                  // keystrokes meant for this field; Escape and Tab still
                  // reach the menu to close it and move on.
                  onKeyDown={(e) => {
                    if (e.key !== "Escape" && e.key !== "Tab") {
                      e.stopPropagation();
                    }
                  }}
                  placeholder="Contains…"
                  aria-label={`Filter ${title}`}
                />
              </div>
            </>
          )}
          {canHide && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                <EyeOff className="text-muted-foreground" />
                Hide column
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export { DataGridColumnHeader };
export type { DataGridColumnHeaderProps };
