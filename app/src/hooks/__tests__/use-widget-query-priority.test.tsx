/** x-query-priority (#1795): load 2, background interval refresh 3, user refetch 1. */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useWidgetQuery, widgetQueryKeyPrefix } from "../use-widget-query";
import { useParameterStore } from "@/stores/parameter-store";

let queryClient: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
const body = { data: { data: [], fields: [] }, error: null, meta: {} };
let fetchMock: MockInstance<typeof fetch>;
const priorities = () =>
  fetchMock.mock.calls.map(
    (c) =>
      ((c[1] as RequestInit).headers as Record<string, string>)[
        "x-query-priority"
      ],
  );

beforeEach(() => {
  queryClient = new QueryClient();
  useParameterStore.getState().clearAll();
  fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(body))),
    );
});
afterEach(() => {
  vi.restoreAllMocks();
  queryClient.clear();
});

describe("useWidgetQuery x-query-priority (#1795)", () => {
  it("tags the first load 2, an interval refetch 3 and a manual refetch 1", async () => {
    const { result } = renderHook(
      () =>
        useWidgetQuery(
          { connectionId: "c1", query: "Q" },
          { refetchInterval: 60 },
        ),
      { wrapper },
    );
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    await act(async () => {
      await result.current.refetch();
    });
    const p = priorities();
    expect(p[0]).toBe("2");
    expect(p[1]).toBe("3");
    expect(p.at(-1)).toBe("1");
  });

  const busy = () =>
    new Response(JSON.stringify({ error: { message: "busy" } }), {
      status: 503,
      headers: { "Retry-After": "0" },
    });

  it("tags an invalidation (card Refresh, form submit) 1, never 3", async () => {
    const input = { connectionId: "c1", query: "Q" };
    const { result } = renderHook(() => useWidgetQuery(input), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: widgetQueryKeyPrefix(input),
      });
    });
    expect(priorities()).toEqual(["2", "1"]);
  });

  it("tags a refetch after a parameter change 1", async () => {
    const input = { connectionId: "c1", query: "RETURN $param_x" };
    act(() => useParameterStore.getState().setParameter("x", 1, "s", "f"));
    const { result } = renderHook(() => useWidgetQuery(input), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    act(() => useParameterStore.getState().setParameter("x", 2, "s", "f"));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(2));
    expect(priorities()).toEqual(["2", "1"]);
  });

  it("keeps a user fetch's tier through its retries", async () => {
    const { result } = renderHook(
      () => useWidgetQuery({ connectionId: "c1", query: "Q" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    fetchMock.mockClear();
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(busy()))
      .mockImplementationOnce(() => Promise.resolve(busy()));
    await act(async () => {
      await result.current.refetch();
    });
    expect(priorities().slice(0, 3)).toEqual(["1", "1", "1"]);
  });

  it("a shed background refresh keeps the last result and is not retried", async () => {
    const { result } = renderHook(
      () =>
        useWidgetQuery(
          { connectionId: "c1", query: "Q" },
          { refetchInterval: 40 },
        ),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => Promise.resolve(busy()));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 30));
    expect(priorities()[0]).toBe("3");
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBeDefined();
    // a retry would have repeated the 503 within the 40 ms tick
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });
  it("a user fetch keeps its tier when its card moves to another key whose interval fires (CR1)", async () => {
    const reqQuery = (c: Parameters<typeof fetch>) =>
      JSON.parse((c[1] as RequestInit).body as string).query as string;
    const A = { connectionId: "c1", query: "A" };
    const B = { connectionId: "c1", query: "B" };
    // a second card keeps key A observed, so A's request stays in flight
    renderHook(() => useWidgetQuery(A), { wrapper });
    const { result, rerender } = renderHook(
      ({ q }: { q: typeof A }) =>
        useWidgetQuery(q, q === B ? { refetchInterval: 30 } : undefined),
      { wrapper, initialProps: { q: A } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    let release!: () => void;
    fetchMock.mockClear();
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          release = () => r(busy());
        }),
    );
    act(() => {
      void result.current.refetch();
    });
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(1));
    rerender({ q: B });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => reqQuery(c) === "B")).toBe(true),
    );
    await waitFor(() => expect(priorities()).toContain("3"));
    release();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter((c) => reqQuery(c) === "A").length,
      ).toBeGreaterThan(1),
    );
  });

  it("rows survive a parameter change after a shed refresh (CR2)", async () => {
    const input = { connectionId: "c1", query: "RETURN $param_x" };
    const rows = {
      data: { data: [{ n: 1 }], fields: ["n"] },
      error: null,
      meta: {},
    };
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(rows))),
    );
    act(() => useParameterStore.getState().setParameter("x", 1, "s", "f"));
    const { result } = renderHook(
      () => useWidgetQuery(input, { refetchInterval: 40 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    fetchMock.mockImplementation(() => Promise.resolve(busy()));
    await waitFor(() => expect(priorities().at(-1)).toBe("3"));
    await new Promise((r) => setTimeout(r, 30));
    fetchMock.mockImplementation(() => new Promise(() => {}));
    act(() => useParameterStore.getState().setParameter("x", 2, "s", "f"));
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data).toBeDefined();
  });
});
