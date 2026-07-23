"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { jsonSyntaxColors } from "@/lib/design-tokens";

export interface JsonViewerProps {
  data: unknown;
  initialExpanded?: boolean | number;
  className?: string;
}

function getType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function JsonValue({ value }: { value: unknown }) {
  const type = getType(value);

  switch (type) {
    case "string":
      return (
        <span className={jsonSyntaxColors.string}>
          &quot;{String(value)}&quot;
        </span>
      );
    case "number":
      return <span className={jsonSyntaxColors.number}>{String(value)}</span>;
    case "boolean":
      return <span className={jsonSyntaxColors.boolean}>{String(value)}</span>;
    case "null":
      return <span className="text-muted-foreground italic">null</span>;
    default:
      return <span>{String(value)}</span>;
  }
}

/** Cap children rendered per node so a giant array/object can't lock the tab. */
const MAX_ENTRIES = 100;

/** A single non-expandable line: optional `key:`, its content, trailing comma.
 *  Shared by leaf values and the [Circular] marker. */
function SimpleRow({
  depth,
  keyName,
  isLast,
  children,
}: {
  depth: number;
  keyName?: string;
  isLast: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start" style={{ paddingLeft: depth * 16 }}>
      {keyName !== undefined && (
        <span className="text-foreground font-medium">{keyName}: </span>
      )}
      {children}
      {!isLast && <span className="text-muted-foreground">,</span>}
    </div>
  );
}

interface JsonNodeProps {
  keyName?: string;
  value: unknown;
  depth: number;
  initialExpanded: boolean | number;
  isLast: boolean;
  /** Object/array values on the path from the root to this node — used to
   *  detect cycles (e.g. `obj.self = obj`) so rendering can't recurse forever. */
  ancestors: ReadonlySet<object>;
}

function JsonNode({
  keyName,
  value,
  depth,
  initialExpanded,
  isLast,
  ancestors,
}: JsonNodeProps) {
  const type = getType(value);
  const isExpandable = type === "object" || type === "array";

  // All hooks must run before any early return (Rules of Hooks), so compute
  // the expanded state up front even for leaf/circular nodes that ignore it.
  const shouldStartExpanded =
    typeof initialExpanded === "boolean"
      ? initialExpanded
      : depth < initialExpanded;
  const [expanded, setExpanded] = React.useState(shouldStartExpanded);

  // A value already on our own path is a circular reference — render a marker
  // instead of recursing into it.
  const isCircular = isExpandable && ancestors.has(value as object);
  if (isCircular) {
    return (
      <SimpleRow depth={depth} keyName={keyName} isLast={isLast}>
        <span className="text-muted-foreground italic">[Circular]</span>
      </SimpleRow>
    );
  }

  if (!isExpandable) {
    return (
      <SimpleRow depth={depth} keyName={keyName} isLast={isLast}>
        <JsonValue value={value} />
      </SimpleRow>
    );
  }

  const entries =
    type === "array"
      ? (value as unknown[]).map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>);
  const bracketOpen = type === "array" ? "[" : "{";
  const bracketClose = type === "array" ? "]" : "}";
  const isEmpty = entries.length === 0;
  // Bound how many children we render at once; the rest collapse into a
  // "… N more" row so a 100k-row result can't freeze the browser.
  const visibleEntries = entries.slice(0, MAX_ENTRIES);
  const hiddenCount = entries.length - visibleEntries.length;
  // Extend the ancestor path with this node's value for the children's cycle
  // checks.
  const childAncestors = new Set(ancestors).add(value as object);

  return (
    <div>
      <button
        type="button"
        className="flex items-center cursor-pointer hover:bg-muted/50 rounded-sm w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ paddingLeft: depth * 16 }}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${keyName ?? (type === "array" ? "array" : "object")}`}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 mr-1 transition-transform text-muted-foreground",
            expanded && "rotate-90",
          )}
        />
        {keyName !== undefined && (
          <span className="text-foreground font-medium">{keyName}: </span>
        )}
        {isEmpty ? (
          <>
            <span className="text-muted-foreground">
              {bracketOpen}
              {bracketClose}
            </span>
            {!isLast && <span className="text-muted-foreground">,</span>}
          </>
        ) : expanded ? (
          <span className="text-muted-foreground">{bracketOpen}</span>
        ) : (
          <>
            <span className="text-muted-foreground">
              {bracketOpen}...{bracketClose}
            </span>
            <span className="text-xs text-muted-foreground ml-1">
              {entries.length} {entries.length === 1 ? "item" : "items"}
            </span>
            {!isLast && <span className="text-muted-foreground">,</span>}
          </>
        )}
      </button>
      {expanded && !isEmpty && (
        <>
          {visibleEntries.map(([key, val], index) => (
            <JsonNode
              key={key}
              keyName={type === "object" ? key : undefined}
              value={val}
              depth={depth + 1}
              initialExpanded={initialExpanded}
              isLast={hiddenCount === 0 && index === visibleEntries.length - 1}
              ancestors={childAncestors}
            />
          ))}
          {hiddenCount > 0 && (
            <div
              className="text-xs text-muted-foreground italic"
              style={{ paddingLeft: (depth + 1) * 16 }}
            >
              … {hiddenCount} more {hiddenCount === 1 ? "item" : "items"}
            </div>
          )}
          <div style={{ paddingLeft: depth * 16 }}>
            <span className="text-muted-foreground ml-4">{bracketClose}</span>
            {!isLast && <span className="text-muted-foreground">,</span>}
          </div>
        </>
      )}
    </div>
  );
}

function JsonViewer({ data, initialExpanded = 1, className }: JsonViewerProps) {
  return (
    <div
      data-testid="json-viewer"
      className={cn(
        "font-mono text-sm rounded-md border bg-muted/30 p-3 overflow-auto",
        className,
      )}
    >
      <JsonNode
        value={data}
        depth={0}
        initialExpanded={initialExpanded}
        isLast={true}
        ancestors={new Set()}
      />
    </div>
  );
}

export { JsonViewer };
