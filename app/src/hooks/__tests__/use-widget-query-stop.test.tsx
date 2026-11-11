/**
 * useWidgetQuery.stop (#2446): aborts the card's request and leaves no result.
 * TanStack's cancelQueries reverts to the previous state, so the hook keeps a
 * `stopped` flag until the next run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useWidgetQuery } from "../use-widget-query";
import { useParameterStore } from "@/stores/parameter-store";
import { useConnectionStatusStore } from "@/stores/connection-status-store";

/** A fetch that never answers on its own; it rejects when its signal aborts. */
function hangingFetch() {
  const signals: AbortSignal[] = [];
  const fn = vi.fn((_url: unknown, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal;
    signals.push(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason));
    });
  });
  return { fn, signals };
}

let queryClient: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
const input = (query = "Q") => ({ connectionId: "c1", query });

beforeEach(() => {
  queryClient = new QueryClient();
  useParameterStore.getState().clearAll();
  useConnectionStatusStore.setState({ statuses: {}, errors: {} });
});
afterEach(() => {
  vi.restoreAllMocks();
  queryClient.clear();
});

describe("useWidgetQuery stop (#2446)", () => {
  it("aborts the request's signal and leaves a stopped, result-less query", async () => {
    const f = hangingFetch();
    vi.spyOn(globalThis, "fetch").mockImplementation(f.fn as never);
    const { result } = renderHook(() => useWidgetQuery(input()), { wrapper });
    await waitFor(() => expect(f.fn).toHaveBeenCalledTimes(1));
    expect(result.current.stopped).toBe(false);

    act(() => {
      result.current.stop();
    });

    expect(f.signals[0].aborted).toBe(true);
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(result.current.stopped).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.isError).toBe(false);
  });

  it("runs again on refetch and clears the stopped flag", async () => {
    const f = hangingFetch();
    vi.spyOn(globalThis, "fetch").mockImplementation(f.fn as never);
    const { result } = renderHook(() => useWidgetQuery(input()), { wrapper });
    await waitFor(() => expect(f.fn).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.stop();
    });
    await waitFor(() => expect(result.current.stopped).toBe(true));

    act(() => {
      result.current.refetch().catch(() => undefined);
    });

    await waitFor(() => expect(f.fn).toHaveBeenCalledTimes(2));
    expect(result.current.stopped).toBe(false);
  });

  it("a parameter change runs the card again", async () => {
    const f = hangingFetch();
    vi.spyOn(globalThis, "fetch").mockImplementation(f.fn as never);
    const { result } = renderHook(
      () => useWidgetQuery(input("Q $param_actor")),
      { wrapper },
    );
    act(() =>
      useParameterStore
        .getState()
        .setParameter("actor", "tom", "tom", "name", "text"),
    );
    await waitFor(() => expect(f.fn).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.stop();
    });
    await waitFor(() => expect(result.current.stopped).toBe(true));

    act(() =>
      useParameterStore
        .getState()
        .setParameter("actor", "meg", "meg", "name", "text"),
    );

    await waitFor(() => expect(f.fn).toHaveBeenCalledTimes(2));
    expect(result.current.stopped).toBe(false);
  });

  it("every card on the same query shows stopped when one stops it", async () => {
    const f = hangingFetch();
    vi.spyOn(globalThis, "fetch").mockImplementation(f.fn as never);
    const { result } = renderHook(
      () => ({ a: useWidgetQuery(input()), b: useWidgetQuery(input()) }),
      { wrapper },
    );
    await waitFor(() => expect(f.fn).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.a.stop();
    });

    await waitFor(() => expect(result.current.b.stopped).toBe(true));
  });
});
