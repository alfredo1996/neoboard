/**
 * The line under a widget title (#2247): "Movies graph · 5 rows · 2 min ago".
 * Seam: the hook, over a real TanStack cache seeded the way useWidgetQuery
 * stores a result. Markdown, iframe, form and selector widgets have no line;
 * the KPI drops its row count.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useWidgetSourceLine } from "../use-widget-source-line";
import { widgetQueryKey } from "../use-widget-query";

const T0 = new Date("2026-10-17T12:00:00Z").getTime();
const base = {
  chartType: "bar",
  connectionId: "c1",
  query: "RETURN 1",
} as const;

function setup(
  widget: { chartType: string; connectionId: string; query: string },
  connectionName: string | undefined,
  seed?: { rows: unknown; at: number },
) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } }, // the card keeps its query observed
  });
  if (seed) {
    client.setQueryData(widgetQueryKey({ ...widget, params: {} }), seed.rows, {
      updatedAt: seed.at,
    });
  }
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useWidgetSourceLine(widget, connectionName), {
    wrapper,
  });
  return { client, ...hook };
}

// useWidgetQuery caches the whole result; the rows sit under `data`.
const result = (rows: unknown[]) => ({ data: rows, resultId: "r" });

describe("useWidgetSourceLine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it("names the connection, the rows and how long ago it ran", () => {
    const { result: line } = setup(base, "Movies graph", {
      rows: result([1, 2, 3, 4, 5]),
      at: T0 - 2 * 60_000,
    });
    expect(line.current).toBe("Movies graph · 5 rows · 2 min ago");
  });

  it("says '1 row' for a single row and 'just now' inside a minute", () => {
    const { result: line } = setup(base, "Movies graph", {
      rows: result([1]),
      at: T0 - 10_000,
    });
    expect(line.current).toBe("Movies graph · 1 row · just now");
  });

  it("drops the row count on a KPI", () => {
    const { result: line } = setup(
      { ...base, chartType: "single-value" },
      "Movies graph",
      { rows: result([1]), at: T0 - 120_000 },
    );
    expect(line.current).toBe("Movies graph · 2 min ago");
  });

  it("leaves out the connection until its name is known", () => {
    const { result: line } = setup(base, undefined, {
      rows: result([1, 2]),
      at: T0 - 120_000,
    });
    expect(line.current).toBe("2 rows · 2 min ago");
  });

  it.each(["markdown", "iframe", "form", "parameter-select"])(
    "gives a %s widget no line",
    (chartType) => {
      const { result: line } = setup({ ...base, chartType }, "Movies graph", {
        rows: result([1]),
        at: T0,
      });
      expect(line.current).toBeUndefined();
    },
  );

  it("has no line before the query has returned", () => {
    const { result: line } = setup(base, "Movies graph");
    expect(line.current).toBeUndefined();
  });

  it("updates when the query refreshes", () => {
    const { result: line, client } = setup(base, "Movies graph", {
      rows: result([1]),
      at: T0 - 120_000,
    });
    act(() => {
      client.setQueryData(
        widgetQueryKey({ ...base, params: {} }),
        result([1, 2, 3]),
        { updatedAt: T0 },
      );
    });
    expect(line.current).toBe("Movies graph · 3 rows · just now");
  });

  it("ticks: the time moves on without the data changing", () => {
    const { result: line } = setup(base, "Movies graph", {
      rows: result([1, 2]),
      at: T0,
    });
    expect(line.current).toBe("Movies graph · 2 rows · just now");
    act(() => {
      vi.advanceTimersByTime(3 * 60_000);
    });
    expect(line.current).toBe("Movies graph · 2 rows · 3 min ago");
    act(() => {
      vi.advanceTimersByTime(2 * 3_600_000);
    });
    expect(line.current).toBe("Movies graph · 2 rows · 2 h ago");
  });
});
