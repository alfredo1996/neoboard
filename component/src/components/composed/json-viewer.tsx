"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
      return <span className="text-green-600 dark:text-green-400">&quot;{String(value)}&quot;</span>;
    case "number":
      return <span className="text-blue-600 dark:text-blue-400">{String(value)}</span>;
    case "boolean":
      return <span className="text-purple-600 dark:text-purple-400">{String(value)}</span>;
    case "null":
      return <span className="text-muted-foreground italic">null</span>;
    default:
      return <span>{String(value)}</span>;
  }
}

interface JsonNodeProps {
  keyName?: string;
  value: unknown;
  depth: number;
  initialExpanded: boolean | number;
  isLast: boolean;
}

function JsonNode({ keyName, value, depth, initialExpanded, isLast }: JsonNodeProps) {
  const type = getType(value);
  const isExpandable = type === "object" || type === "array";

  const shouldStartExpanded =
    typeof initialExpanded === "boolean"
      ? initialExpanded
      : depth < initialExpanded;

  const [expanded, setExpanded] = React.useState(shouldStartExpanded);

  if (!isExpandable) {
    return (
      <div className="flex items-start" style={{ paddingLeft: depth * 16 }}>
        {keyName !== undefined && (
          <span className="text-foreground font-medium">{keyName}: </span>
        )}
        <JsonValue value={value} />
        {!isLast && <span className="text-muted-foreground">,</span>}
      </div>
    );
  }

  const entries =
    type === "array"
      ? (value as unknown[]).map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>);
  const bracketOpen = type === "array" ? "[" : "{";
  const bracketClose = type === "array" ? "]" : "}";
  const isEmpty = entries.length === 0;

  return (
    <div>
      <div
        className="flex items-center cursor-pointer hover:bg-muted/50 rounded-sm"
        style={{ paddingLeft: depth * 16 }}
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 mr-1 transition-transform text-muted-foreground",
            expanded && "rotate-90"
          )}
        />
        {keyName !== undefined && (
          <span className="text-foreground font-medium">{keyName}: </span>
        )}
        {isEmpty ? (
          <>
            <span className="text-muted-foreground">
              {bracketOpen}{bracketClose}
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
      </div>
      {expanded && !isEmpty && (
        <>
          {entries.map(([key, val], index) => (
            <JsonNode
              key={key}
              keyName={type === "object" ? key : undefined}
              value={val}
              depth={depth + 1}
              initialExpanded={initialExpanded}
              isLast={index === entries.length - 1}
            />
          ))}
          <div style={{ paddingLeft: depth * 16 }}>
            <span className="text-muted-foreground ml-4">{bracketClose}</span>
            {!isLast && <span className="text-muted-foreground">,</span>}
          </div>
        </>
      )}
    </div>
  );
}

function JsonViewer({
  data,
  initialExpanded = 1,
  className,
}: JsonViewerProps) {
  return (
    <div
      className={cn(
        "font-mono text-sm rounded-md border bg-muted/30 p-3 overflow-auto",
        className
      )}
    >
      <JsonNode
        value={data}
        depth={0}
        initialExpanded={initialExpanded}
        isLast={true}
      />
    </div>
  );
}

export { JsonViewer };
