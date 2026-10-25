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

/** How many fields a folded row shows before the ellipsis (#2232). */
const PREVIEW_FIELDS = 3;

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
        <span className={jsonSyntaxColors.key}>{keyName}:&nbsp;</span>
      )}
      {children}
      {!isLast && <span className={jsonSyntaxColors.punctuation}>,</span>}
    </div>
  );
}

/** A value inside a folded row's preview: primitives as they are, containers abbreviated. */
function PreviewValue({ value }: { value: unknown }) {
  const type = getType(value);
  if (type === "array" || type === "object") {
    const [open, close] = type === "array" ? ["[", "]"] : ["{", "}"];
    const size =
      type === "array"
        ? (value as unknown[]).length
        : Object.keys(value as object).length;
    return (
      <span className={jsonSyntaxColors.punctuation}>
        {open}
        {size === 0 ? "" : "…"}
        {close}
      </span>
    );
  }
  return <JsonValue value={value} />;
}

/**
 * What a folded row shows: its first fields on one line, so the row says what
 * it is without being opened (#2232). `{id: 578, status: "shipped", … }`.
 */
function FoldedPreview({
  entries,
  isArray,
}: {
  entries: ReadonlyArray<readonly [string, unknown]>;
  isArray: boolean;
}) {
  const shown = entries.slice(0, PREVIEW_FIELDS);
  const more = entries.length > shown.length;
  const punct = jsonSyntaxColors.punctuation;
  return (
    <span className="min-w-0 truncate">
      <span className={punct}>{isArray ? "[" : "{"}</span>
      {shown.map(([key, val], i) => (
        <React.Fragment key={key}>
          {i > 0 && <span className={punct}>, </span>}
          {!isArray && (
            <>
              <span className={jsonSyntaxColors.key}>{key}</span>
              <span className={punct}>: </span>
            </>
          )}
          <PreviewValue value={val} />
        </React.Fragment>
      ))}
      <span className={punct}>
        {more ? ", … " : ""}
        {isArray ? "]" : "}"}
      </span>
    </span>
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
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 mr-1 shrink-0 transition-transform text-muted-foreground",
            expanded && "rotate-90",
          )}
        />
        {keyName !== undefined && (
          <span className={jsonSyntaxColors.key}>{keyName}:&nbsp;</span>
        )}
        {isEmpty && (
          <>
            <span className={jsonSyntaxColors.punctuation}>
              {bracketOpen}
              {bracketClose}
            </span>
            {!isLast && <span className={jsonSyntaxColors.punctuation}>,</span>}
          </>
        )}
        {!isEmpty && expanded && (
          <span className={jsonSyntaxColors.punctuation}>{bracketOpen}</span>
        )}
        {!isEmpty && !expanded && (
          <>
            <FoldedPreview entries={entries} isArray={type === "array"} />
            {!isLast && <span className={jsonSyntaxColors.punctuation}>,</span>}
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
        "font-mono text-[12.5px] leading-[1.75] overflow-auto",
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
