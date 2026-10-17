"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { matchQuery, useQueryClient } from "@tanstack/react-query";
import { isDataWidget } from "@/lib/widget/widget-actions";
import { widgetQueryKeyPrefix } from "./use-widget-query";

const TICK_MS = 30_000;
/** One row that is the number itself: no row count (owner, #2247). */
const SINGLE_VALUE_TYPES = new Set(["single-value", "gauge"]);

/** "just now", "2 min ago", "3 h ago", "4 d ago". */
export function formatAgo(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

interface SourceWidget {
  chartType: string;
  connectionId: string;
  database?: string;
  query: string;
}

/**
 * The newest result among the queries the card observes, as "updatedAt|rows"
 * (rows empty when the result is not a row list). Only observed queries count:
 * another parameter variant left in the cache, or a query a cleared parameter
 * disabled, is not what the card's body shows. A string, so the snapshot is
 * stable by value.
 */
function useCachedResult(widget: SourceWidget): string {
  const client = useQueryClient();
  const cache = client.getQueryCache();
  const prefix = widgetQueryKeyPrefix(widget);
  return useSyncExternalStore(
    (notify) =>
      cache.subscribe((event) => {
        if (matchQuery({ queryKey: prefix }, event.query)) notify();
      }),
    () => {
      let latest = "";
      let at = 0;
      for (const q of cache.findAll({ queryKey: prefix, type: "active" })) {
        if (q.state.status !== "success" || q.state.dataUpdatedAt <= at) {
          continue;
        }
        at = q.state.dataUpdatedAt;
        const rows = (q.state.data as { data?: unknown } | undefined)?.data;
        latest = `${at}|${Array.isArray(rows) ? rows.length : ""}`;
      }
      return latest;
    },
    () => "",
  );
}

/**
 * The line under a widget title: the connection's own name, the row count and
 * the time since the query last succeeded (#2247). Absent for widgets that run
 * no query (markdown, iframe, form, selector) and before the first result. A
 * KPI shows no row count: its one row is the number itself.
 */
export function useWidgetSourceLine(
  widget: SourceWidget,
  connectionName: string | undefined,
): string | undefined {
  const cached = useCachedResult(widget);
  const [now, setNow] = useState(() => Date.now());
  const show = isDataWidget(widget.chartType) && cached !== "";
  useEffect(() => {
    if (!show) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [show]);
  if (!show) return undefined;
  const [at, rows] = cached.split("|");
  const count = Number(rows);
  return [
    connectionName,
    rows !== "" && !SINGLE_VALUE_TYPES.has(widget.chartType)
      ? `${count} ${count === 1 ? "row" : "rows"}`
      : undefined,
    formatAgo(Math.max(0, now - Number(at))),
  ]
    .filter(Boolean)
    .join(" · ");
}
