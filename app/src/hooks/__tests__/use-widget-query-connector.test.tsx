/**
 * useWidgetQuery against a dead connector (#1678) — the wiring that the pure
 * predicate tests cannot see: one request, a typed error, the connection
 * flagged in the status store, and no refetch on window focus.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { QueryObserverOptions } from "@tanstack/react-query";
import React from "react";
import { useWidgetQuery } from "../use-widget-query";
import {
  ClientQueueTimeoutError,
  ConnectorUnavailableError,
} from "@/lib/api/api-client";
import { useConnectionStatusStore } from "@/stores/connection-status-store";

function envelopeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const DEAD_502 = envelopeResponse(502, {
  data: null,
  error: {
    code: "CONNECTOR_UNAVAILABLE",
    message: "timeout exceeded when trying to connect",
    details: { reason: "network" },
  },
  meta: null,
});

/** What the scheduler says to the sixth widget on a five-slot connection. */
const QUEUED_408 = envelopeResponse(408, {
  data: null,
  error: { code: "REQUEST_TIMEOUT", message: "queued too long" },
  meta: null,
});

const OK_200 = envelopeResponse(200, {
  data: { data: [{ n: 1 }] },
  error: null,
  meta: { resultId: "r1" },
});

let queryClient: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  queryClient = new QueryClient();
  useConnectionStatusStore.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
  queryClient.clear();
});

describe("useWidgetQuery on a dead connector (#1678)", () => {
  it("sends exactly one request, fails with ConnectorUnavailableError, and flags the connection", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(DEAD_502);

    const { result } = renderHook(
      () => useWidgetQuery({ connectionId: "dead", query: "SELECT 1" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 5_000,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeInstanceOf(ConnectorUnavailableError);
    expect(useConnectionStatusStore.getState().getStatus("dead")).toBe("error");
  });

  it("does not auto-retry a queue timeout on a connection already flagged dead", async () => {
    useConnectionStatusStore
      .getState()
      .noteQueryOutcome(
        "dead",
        new ConnectorUnavailableError("dead", "network"),
      );
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(QUEUED_408);

    const { result } = renderHook(
      () => useWidgetQuery({ connectionId: "dead", query: "SELECT 1" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 3_000,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeInstanceOf(ClientQueueTimeoutError);
    // And the 408 did not talk the store out of its verdict.
    expect(useConnectionStatusStore.getState().getStatus("dead")).toBe("error");
  });

  it("does not refetch on window focus", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(OK_200);

    const { result } = renderHook(
      () => useWidgetQuery({ connectionId: "ok", query: "SELECT 1" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [query] = queryClient.getQueryCache().findAll();
    // The observer stores its full options on the query; `Query.options` is
    // typed as the narrower QueryOptions, so widen to what is actually there.
    const options = query.options as QueryObserverOptions;
    expect(options.refetchOnWindowFocus).toBe(false);
  });

  it("clears the flag once a query gets through again", async () => {
    useConnectionStatusStore
      .getState()
      .noteQueryOutcome(
        "ok",
        new ConnectorUnavailableError("was dead", "network"),
      );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(OK_200);

    const { result } = renderHook(
      () => useWidgetQuery({ connectionId: "ok", query: "SELECT 1" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(useConnectionStatusStore.getState().getStatus("ok")).toBe(
      "connected",
    );
  });
});
