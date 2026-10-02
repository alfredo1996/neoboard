/**
 * useWidgetQuery against a dead connector (#1678) — the wiring that the pure
 * predicate tests cannot see: one request, a typed error, the connection
 * flagged in the status store, and no refetch on window focus.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import type { QueryObserverOptions } from "@tanstack/react-query";
import React from "react";
import { useWidgetQuery } from "../use-widget-query";
import { useSeedQuery } from "../use-seed-query";
import {
  PROBE_CHECK_MS,
  useConnectorRecovery,
} from "../use-connector-recovery";
import { DEAD_CONNECTOR_TTL_MS } from "@/lib/connector/connection-error-classifier";
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

describe("useWidgetQuery request body", () => {
  it("sends the widget's query text unchanged, surrounding whitespace and CRLF included", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(OK_200);
    const query = "  RETURN 1\r\n";

    const { result } = renderHook(
      () => useWidgetQuery({ connectionId: "ok", query }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(String(init?.body)).query).toBe(query);
  });
});

/**
 * #1888 — the fetch ignored TanStack's signal, so leaving a dashboard left
 * its queries in flight. Six of them hung on a dead connector own the
 * browser's whole per-origin connection pool: the next page's payload queued
 * behind them, and a sidebar click took 52 s to navigate.
 */
describe("useWidgetQuery cancellation (#1888)", () => {
  it("aborts the in-flight request when the widget unmounts", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise<Response>(() => {}));

    const { unmount } = renderHook(
      () => useWidgetQuery({ connectionId: "slow", query: "SELECT 1" }),
      { wrapper },
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());

    const signal = fetchSpy.mock.calls[0][1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);

    unmount();
    await waitFor(() => expect(signal?.aborted).toBe(true));
  });
});

/**
 * #2167 — nothing re-probed a flagged connection, so a dashboard parked on
 * "Connector unavailable" stayed there after its database came back.
 */
describe("useConnectorRecovery (#2167)", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    focusManager.setFocused(undefined);
    vi.useRealTimers();
  });

  /** A query the database itself rejected: the connector answered. */
  const BROKEN_400 = envelopeResponse(400, {
    data: null,
    error: { code: "QUERY_ERROR", message: "syntax error" },
    meta: null,
  });

  /**
   * Two widgets and a selector on one dead connection, c1, all parked. Q1 had
   * rows first: a refetch of a query with data cancels and re-sends one in
   * flight. Beside them, a broken widget on c2, which the Connections page
   * found healthy: parked too, but there is nothing to probe there.
   */
  async function parkedDashboard() {
    useConnectionStatusStore.getState().setStatus("c2", "connected");
    let c1 = DEAD_502;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(OK_200)
      .mockImplementation(async (_url, init) =>
        bodyOf(init).connectionId === "c2" ? BROKEN_400 : c1,
      );
    const { result } = renderHook(
      () => {
        useConnectorRecovery();
        return [
          useWidgetQuery({ connectionId: "c1", query: "Q1" }),
          useWidgetQuery({ connectionId: "c1", query: "Q2" }),
          useSeedQuery("c1", "SEED", true),
          useWidgetQuery({ connectionId: "c2", query: "BROKEN" }),
        ] as const;
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current[2].error).not.toBeNull());
    await act(() => result.current[0].refetch());
    await waitFor(() =>
      expect(result.current.every((q) => q.error)).toBe(true),
    );
    const sentTo = (id: string) =>
      fetchSpy.mock.calls.filter(([, init]) => bodyOf(init).connectionId === id)
        .length;
    expect(sentTo("c1")).toBe(4);
    expect(sentTo("c2")).toBe(1);
    return { fetchSpy, result, sentTo, recover: () => (c1 = OK_200) };
  }
  const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body));
  /** Long enough for a probe that fell due at the start of it to go out. */
  const tick = () =>
    vi.advanceTimersByTimeAsync(DEAD_CONNECTOR_TTL_MS + PROBE_CHECK_MS);
  const status = () => useConnectionStatusStore.getState().getStatus("c1");

  it("probes once per interval, then re-runs everything parked once one gets through", async () => {
    const { result, sentTo, recover } = await parkedDashboard();

    await tick();
    expect(sentTo("c1")).toBe(5);
    expect(status()).toBe("error");

    recover();
    await tick();
    await waitFor(() =>
      expect(result.current.slice(0, 3).every((q) => q.error === null)).toBe(
        true,
      ),
    );
    expect(sentTo("c1")).toBe(8);
    expect(status()).toBe("connected");
  });

  it("never re-runs a parked query on a connection that is not flagged", async () => {
    const { sentTo, recover } = await parkedDashboard();

    await tick();
    await tick();
    recover();
    await tick();
    await tick();
    expect(sentTo("c2")).toBe(1);
  });

  /**
   * The server's memo runs a TTL from each failed dial, not from when the
   * probe was sent. Timed off anything earlier, the next probe lands inside
   * it and only replays it: on a host that drops packets, every other probe.
   */
  it("waits a full TTL after a slow probe fails before sending the next", async () => {
    const { fetchSpy } = await parkedDashboard();
    const DIAL_MS = 10_000; // a packet-dropping host's connect timeout
    const sentAt: number[] = [];
    const failedAt: number[] = [];
    fetchSpy.mockImplementation(() => {
      sentAt.push(Date.now());
      return new Promise((resolve) =>
        setTimeout(() => {
          failedAt.push(Date.now());
          resolve(DEAD_502);
        }, DIAL_MS),
      );
    });

    await vi.advanceTimersByTimeAsync(
      2 * (DEAD_CONNECTOR_TTL_MS + DIAL_MS + PROBE_CHECK_MS),
    );
    // One probe at a time, never a sibling while one is in flight.
    expect(sentAt).toHaveLength(2);
    expect(sentAt[1] - failedAt[0]).toBeGreaterThanOrEqual(
      DEAD_CONNECTOR_TTL_MS,
    );
  });

  it("holds the probe while the tab is hidden, and sends it once visible", async () => {
    const { sentTo } = await parkedDashboard();

    focusManager.setFocused(false);
    await tick();
    expect(sentTo("c1")).toBe(4);

    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(PROBE_CHECK_MS);
    expect(sentTo("c1")).toBe(5);
  });

  it("keeps no timer while nothing is flagged", () => {
    renderHook(() => useConnectorRecovery(), { wrapper });
    expect(vi.getTimerCount()).toBe(0);

    act(() =>
      useConnectionStatusStore.getState().setStatus("c1", "error", "down"),
    );
    expect(vi.getTimerCount()).toBe(1);

    act(() => useConnectionStatusStore.getState().setStatus("c1", "connected"));
    expect(vi.getTimerCount()).toBe(0);
  });
});
