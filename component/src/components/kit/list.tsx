import * as React from "react";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

export interface ListProps {
  /** Accessible name of the table. */
  label: string;
  /** Column headers, name column first. The menu column has no header. */
  columns: readonly string[];
  children: React.ReactNode;
  className?: string;
  /** Which column the rows are sorted by, and which way. The caller owns the sorting. */
  sort?: { column: string; direction: "ascending" | "descending" };
  /** Makes each column header a sort button; called with the column's name. */
  onSort?: (column: string) => void;
}

/** Column widths: the name column 2.4 parts, the rest one part each, of 100% less the 40 px menu. */
function widths(columns: readonly string[]) {
  const total = 2.4 + Math.max(columns.length - 1, 0);
  return columns.map(
    (_, i) =>
      `calc((100% - 40px) * ${((i === 0 ? 2.4 : 1) / total).toFixed(4)})`,
  );
}

// The columns, so a row keys its meta cells by the column they sit in.
const ColumnsContext = React.createContext<readonly string[]>([]);

/** Rows in one card with a header row. */
function List({
  label,
  columns,
  children,
  className,
  sort,
  onSort,
}: Readonly<ListProps>) {
  return (
    <Panel
      className={cn(
        "overflow-hidden text-sm hover:border-card-edge focus-within:border-card-edge",
        className,
      )}
    >
      <table
        aria-label={label}
        className="w-full table-fixed border-collapse text-left"
      >
        <colgroup>
          {widths(columns).map((w, i) => (
            <col
              key={columns[i]}
              style={{ width: w }}
              className={i === 0 ? undefined : "hidden md:table-column"}
            />
          ))}
          <col style={{ width: "40px" }} />
        </colgroup>
        <thead className="hidden md:table-header-group">
          <tr className="h-9 border-b border-rule text-xs text-muted-foreground">
            {columns.map((c, i) => {
              const direction = sort?.column === c ? sort.direction : "none";
              return (
                <th
                  key={c}
                  scope="col"
                  aria-sort={onSort ? direction : undefined}
                  className={cn("font-normal", i === 0 ? "pl-4" : "pl-3")}
                >
                  {onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(c)}
                      className="rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {c}
                      {direction !== "none" && (
                        <span aria-hidden>
                          {direction === "ascending" ? " ↑" : " ↓"}
                        </span>
                      )}
                    </button>
                  ) : (
                    c
                  )}
                </th>
              );
            })}
            <th scope="col" className="pr-4">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <ColumnsContext.Provider value={columns}>
            {children}
          </ColumnsContext.Provider>
        </tbody>
      </table>
    </Panel>
  );
}

export interface ListRowProps {
  title: string;
  /** A line under the title; a node when part of it is live, e.g. a relative time. */
  description?: React.ReactNode;
  /**
   * Where the item lives: the stretched link's target. Without it the title is
   * a stretched button when `onOpen` is set, and plain text when it is not.
   */
  href?: string;
  /** Opens the item in the app (router push); the plain click is then not a page load. */
  /** Gets the title element, so a caller can send focus back to it on close. */
  onOpen?: (opener: HTMLElement) => void;
  /** One node per meta column; hidden below 768 px. */
  meta?: readonly React.ReactNode[];
  /** The "⋯" button or menu trigger. It sits above the link, never inside it. */
  menu?: React.ReactNode;
  className?: string;
}

const PLAIN_LEFT_CLICK = (e: React.MouseEvent) =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

const TITLE_CLASS =
  "block truncate font-medium text-inherit no-underline after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring";

function RowTitle({
  title,
  href,
  onOpen,
}: Readonly<Pick<ListRowProps, "title" | "href" | "onOpen">>) {
  if (href) {
    return (
      <a
        href={href}
        onClick={(e) => {
          if (onOpen && PLAIN_LEFT_CLICK(e)) {
            e.preventDefault();
            onOpen(e.currentTarget);
          }
        }}
        className={TITLE_CLASS}
        title={title}
      >
        {title}
      </a>
    );
  }
  if (onOpen) {
    return (
      <button
        type="button"
        onClick={(e) => onOpen(e.currentTarget)}
        className={cn(TITLE_CLASS, "w-full text-left")}
        title={title}
      >
        {title}
      </button>
    );
  }
  return (
    <span className="block truncate font-medium" title={title}>
      {title}
    </span>
  );
}

/** A row that opens its item wherever it is clicked. */
function ListRow({
  title,
  description,
  href,
  onOpen,
  meta,
  menu,
  className,
}: Readonly<ListRowProps>) {
  const columns = React.useContext(ColumnsContext);
  return (
    <tr
      className={cn(
        "relative h-[58px] border-b border-rule last:border-b-0 hover:bg-active",
        className,
      )}
    >
      <td className="min-w-0 overflow-hidden py-2.5 pl-4 md:py-0">
        <RowTitle title={title} href={href} onOpen={onOpen} />
        {description && (
          <small className="block truncate text-xs text-foreground-2">
            {description}
          </small>
        )}
      </td>
      {meta?.map((cell, i) => (
        <td
          key={columns[i + 1] ?? `extra-${columns.length + i}`}
          className="hidden truncate pl-3 text-caption tabular-nums text-foreground-2 md:table-cell"
        >
          {cell}
        </td>
      ))}
      <td className="pr-4">
        <div className="relative z-10 flex justify-end">{menu}</div>
      </td>
    </tr>
  );
}

export { List, ListRow };
