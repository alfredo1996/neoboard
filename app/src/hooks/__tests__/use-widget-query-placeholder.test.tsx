/**
 * useWidgetQuery keeps the previous result under a refetch (#2369): a new
 * parameter value shows the old rows as placeholder data until the new ones
 * land, but never for a disabled query or for another query's rows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useWidgetQuery } from "../use-widget-query";
import { useParameterStore } from "@/stores/parameter-store";

/** A fetch that answers the query with `rows:<actor>` once its gate opens. */
function gatedFetch() {
  const gates: Array<() => void> = [];
  const fn = vi.fn((_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      params?: { param_actor?: string };
      query: string;
    };
    return new Promise<Response>((resolve) => {
      gates.push(() =>
        resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: () =>
            Promise.resolve({
              data: {
                data: [`${body.query}:${body.params?.param_actor}`],
              },
              error: null,
              meta: { resultId: `r:${body.params?.param_actor}` },
            }),
        } as unknown as Response),
      );
    });
  });
  return { fn, release: () => gates.shift()?.() };
}

let queryClient: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
const setActor = (v: unknown) =>
  act(() => {
    useParameterStore
      .getState()
      .setParameter("actor", v, String(v), "name", "text");
  });
const input = (query = "Q $param_actor") => ({
  connectionId: "c1",
  query,
});

beforeEach(() => {
  queryClient = new QueryClient();
  useParameterStore.getState().clearAll();
});
afterEach(() => {
  vi.restoreAllMocks();
  queryClient.clear();
});

describe("useWidgetQuery placeholder data (#2369)", () => {
  it("keeps the previous rows, flagged as placeholder, until the new result lands", async () => {
    const f = gatedFetch();
    vi.spyOn(globalThis, "fetch").mockImplementation(f.fn as never);
    setActor("tom");
    const { result } = renderHook(() => useWidgetQuery(input()), { wrapper });
    await waitFor(() => expect(f.fn).toHaveBeenCalledTimes(1));
    f.release();
    await waitFor(() => expect(result.current.data?.resultId).toBe("r:tom"));
    expect(result.current.isPlaceholderData).toBe(false);

    setActor("meg");
    await waitFor(() => expect(f.fn).toHaveBeenCalledTimes(2));
    expect(result.current.data?.resultId).toBe("r:tom");
    expect(result.current.isPlaceholderData).toBe(true);

    f.release();
    await waitFor(() => expect(result.current.data?.resultId).toBe("r:meg"));
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it("shows nothing for a disabled query, and the next pick starts from a skeleton, not the rows from before the clear", async () => {
    const f = gatedFetch();
    vi.spyOn(globalThis, "fetch").mockImplementation(f.fn as never);
    setActor("tom");
    const { result } = renderHook(() => useWidgetQuery(input()), { wrapper });
    await waitFor(() => expect(f.fn).toHaveBeenCalledTimes(1));
    f.release();
    await waitFor(() => expect(result.current.data?.resultId).toBe("r:tom"));

    act(() => useParameterStore.getState().clearParameter("actor"));
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeUndefined();

    setActor("meg");
    await waitFor(() => expect(f.fn).toHaveBeenCalledTimes(2));
    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it("never shows another query's rows when the query text changes", async () => {
    const f = gatedFetch();
    vi.spyOn(globalThis, "fetch").mockImplementation(f.fn as never);
    setActor("tom");
    const { result, rerender } = renderHook(
      ({ q }) => useWidgetQuery(input(q), undefined),
      { wrapper, initialProps: { q: "A $param_actor" } },
    );
    await waitFor(() => expect(f.fn).toHaveBeenCalledTimes(1));
    f.release();
    await waitFor(() => expect(result.current.data).toBeDefined());

    rerender({ q: "B $param_actor" });
    await waitFor(() => expect(f.fn).toHaveBeenCalledTimes(2));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isPending).toBe(true);
  });
});
