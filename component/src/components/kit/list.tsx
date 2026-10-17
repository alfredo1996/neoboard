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
}

/** The first column takes 2.4 parts, the rest one part each, the menu 40 px. */
function template(columns: readonly string[]) {
  return [
    "minmax(0,2.4fr)",
    ...columns.slice(1).map(() => "minmax(0,1fr)"),
    "40px",
  ].join(" ");
}

const ROW_GRID =
  "grid items-center gap-3 px-4 grid-cols-[minmax(0,1fr)_40px] md:grid-cols-[var(--list-cols)]";

/** Rows in one card with a header row. */
function List({ label, columns, children, className }: Readonly<ListProps>) {
  return (
    <Panel
      role="table"
      aria-label={label}
      style={{ "--list-cols": template(columns) } as React.CSSProperties}
      className={cn(
        "overflow-hidden text-sm hover:border-card-edge focus-within:border-card-edge",
        className,
      )}
    >
      <div
        role="row"
        className={cn(
          ROW_GRID,
          "hidden h-9 border-b border-rule text-xs text-muted-foreground md:grid",
        )}
      >
        {columns.map((c) => (
          <span key={c} role="columnheader">
            {c}
          </span>
        ))}
        <span role="columnheader">
          <span className="sr-only">Actions</span>
        </span>
      </div>
      {children}
    </Panel>
  );
}

export interface ListRowProps {
  title: string;
  description?: string;
  /** Where the item lives: the stretched link's target. */
  href: string;
  /** Opens the item in the app (router push); the plain click is then not a page load. */
  onOpen?: () => void;
  /** One node per meta column; hidden below 768 px. */
  meta?: readonly React.ReactNode[];
  /** The "⋯" button or menu trigger. It sits above the link, never inside it. */
  menu?: React.ReactNode;
  className?: string;
}

const PLAIN_LEFT_CLICK = (e: React.MouseEvent) =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

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
  return (
    <div
      role="row"
      className={cn(
        ROW_GRID,
        "relative min-h-[58px] border-b border-rule py-2.5 last:border-b-0 hover:bg-active md:py-0",
        className,
      )}
    >
      <span role="cell" className="min-w-0">
        <a
          href={href}
          onClick={(e) => {
            if (onOpen && PLAIN_LEFT_CLICK(e)) {
              e.preventDefault();
              onOpen();
            }
          }}
          className="block truncate font-medium text-inherit no-underline after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
        >
          {title}
        </a>
        {description && (
          <small className="block truncate text-xs text-foreground-2">
            {description}
          </small>
        )}
      </span>
      {React.Children.map(meta, (cell) => (
        <span
          role="cell"
          className="hidden truncate text-[13px] tabular-nums text-foreground-2 md:block"
        >
          {cell}
        </span>
      ))}
      <span role="cell" className="relative z-10 justify-self-end">
        {menu}
      </span>
    </div>
  );
}

export { List, ListRow };
