/** x-query-priority (#1795): load 2, background interval refresh 3, user refetch 1. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useWidgetQuery } from "../use-widget-query";
import { useParameterStore } from "@/stores/parameter-store";

let queryClient: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
const body = { data: { data: [], fields: [] }, error: null, meta: {} };
let fetchMock: { mock: { calls: unknown[][] } };
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
});
