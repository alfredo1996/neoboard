/**
 * #1717 — useWidgetQuery for a widget that binds its own `$param_x` (the
 * guided builder's filter). The readiness gate must see `input.params`, or
 * the card waits forever for a parameter nothing on the dashboard supplies.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useParameterStore } from "@/stores/parameter-store";
import { useWidgetQuery } from "../use-widget-query";

const query = "MATCH (n:Movie) WHERE n.released > $param_released RETURN n";

let client: QueryClient;
function wrapper({ children }: React.PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const fetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  json: async () => ({ data: { data: [], resultId: "r1" } }),
}));

describe("useWidgetQuery — widget-bound parameters (#1717)", () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useParameterStore.getState().clearAll();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs with the widget's own binding when no dashboard parameter supplies it", async () => {
    const input = { connectionId: "c1", query, params: { param_released: 2000 } };
    const { result } = renderHook(() => useWidgetQuery(input), { wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).params).toEqual({
      param_released: 2000,
    });
    expect(result.current.missingParams).toEqual([]);
  });

  it("waits, naming the parameter, when nothing binds it", async () => {
    const input = { connectionId: "c1", query };
    const { result } = renderHook(() => useWidgetQuery(input), { wrapper });

    await waitFor(() => expect(result.current.missingParams).toEqual(["released"]));
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
