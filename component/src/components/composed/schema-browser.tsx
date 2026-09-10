import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DatabaseSchema } from "@/lib/schema-transforms";
import {
  filterSchemaTree,
  toSchemaTree,
  type SchemaTreeNode,
} from "@/lib/schema-tree";

export interface SchemaBrowserProps {
  /** Schema for the selected connection. Undefined while none is loaded. */
  schema?: DatabaseSchema;
  loading?: boolean;
  /** Message shown in place of the tree when the schema fetch failed. */
  error?: string;
  /** Called with the bare identifier the user clicked (label, table, property, column). */
  onInsert: (identifier: string) => void;
  className?: string;
}

const rowClass =
  "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function Node({
  node,
  open,
  onToggle,
  onInsert,
}: Readonly<{
  node: SchemaTreeNode;
  open: boolean;
  onToggle: () => void;
  onInsert: (identifier: string) => void;
}>) {
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <div className="flex items-center">
        {hasChildren ? (
          <button
            type="button"
            className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
          >
            <ChevronRight
              className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          className={cn(rowClass, "font-medium")}
          onClick={() => onInsert(node.name)}
        >
          <span className="truncate">{node.name}</span>
        </button>
      </div>
      {open && hasChildren && (
        <ul className="ml-4 border-l pl-1">
          {node.children.map((leaf) => (
            <li key={leaf.name}>
              <button
                type="button"
                className={rowClass}
                title={`${leaf.name}: ${leaf.type}`}
                onClick={() => onInsert(leaf.name)}
              >
                <span className="truncate">{leaf.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {leaf.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Tree of a connection's schema (labels → properties, relationship types →
 * properties, tables → columns) with a search box. Clicking any name hands the
 * identifier to `onInsert`; the caller decides where it goes (#1693).
 */
function SchemaBrowser({
  schema,
  loading = false,
  error,
  onInsert,
  className,
}: Readonly<SchemaBrowserProps>) {
  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const searching = search.trim().length > 0;

  const tree = React.useMemo(
    () => (schema ? toSchemaTree(schema) : []),
    [schema],
  );
  const visible = React.useMemo(
    () => filterSchemaTree(tree, search),
    [tree, search],
  );

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  let body: React.ReactNode;
  if (loading) {
    body = <p className="text-xs text-muted-foreground">Loading schema…</p>;
  } else if (error) {
    body = (
      <p role="alert" className="text-xs text-destructive">
        {error}
      </p>
    );
  } else if (tree.length === 0) {
    body = (
      <p className="text-xs text-muted-foreground">
        No labels or tables found.
      </p>
    );
  } else if (visible.length === 0) {
    body = <p className="text-xs text-muted-foreground">No matches.</p>;
  } else {
    body = visible.map((section) => (
      <div key={section.title} className="space-y-1">
        <p className="px-2 text-xs font-medium text-muted-foreground">
          {section.title}
        </p>
        <ul>
          {section.nodes.map((node) => {
            const key = `${section.title}/${node.name}`;
            return (
              <Node
                key={key}
                node={node}
                // A search already narrowed the children to the matches, so
                // show them rather than making the user expand each hit.
                open={searching || expanded.has(key)}
                onToggle={() => toggle(key)}
                onInsert={onInsert}
              />
            );
          })}
        </ul>
      </div>
    ));
  }

  return (
    <div
      className={cn("flex flex-col rounded-xl border bg-muted/30", className)}
      data-testid="schema-browser"
    >
      <div className="shrink-0 border-b p-2">
        <Input
          type="search"
          size="sm"
          aria-label="Search schema"
          placeholder="Search schema…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">{body}</div>
    </div>
  );
}

export { SchemaBrowser };
