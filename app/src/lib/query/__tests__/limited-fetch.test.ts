import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { limitedFetch, QUERY_FETCH_LIMIT } from "../limited-fetch";

interface Pending {
  resolve: (r: Response) => void;
  reject: (e: unknown) => void;
}

describe("limitedFetch", () => {
  let pending: Pending[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pending = [];
    fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve, reject) => {
          pending.push({ resolve, reject });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  // The limiter is module state: drain every request so the next test starts idle.
  afterEach(async () => {
    for (let i = 0; i < 20; i++) {
      pending.splice(0).forEach((p) => p.resolve(new Response("{}")));
      await flush();
    }
    vi.unstubAllGlobals();
  });

  const flush = () => new Promise((r) => setTimeout(r, 0));
  const fire = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      limitedFetch(`/api/query?${i}`, {}).catch(() => undefined),
    );

  it("keeps at most QUERY_FETCH_LIMIT requests in flight and starts the next as one finishes", async () => {
    fire(QUERY_FETCH_LIMIT + 2);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(QUERY_FETCH_LIMIT);
    pending[0].resolve(new Response("{}"));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(QUERY_FETCH_LIMIT + 1);
  });

  it("never fetches a waiter whose signal aborts while it waits, and leaves no dead slot behind", async () => {
    fire(QUERY_FETCH_LIMIT);
    const ac = new AbortController();
    const waiter = limitedFetch("/api/query?late", { signal: ac.signal });
    await flush();
    ac.abort();
    await expect(waiter).rejects.toMatchObject({ name: "AbortError" });
    pending[0].resolve(new Response("{}"));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(QUERY_FETCH_LIMIT);
    expect(fetchMock.mock.calls.some((c) => c[0] === "/api/query?late")).toBe(
      false,
    );
    // A waiter left in the queue would eat the freed slot; this one must start.
    fire(1);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(QUERY_FETCH_LIMIT + 1);
  });

  it("rejects at once, without fetching, when the signal is already aborted", async () => {
    await expect(
      limitedFetch("/api/query", { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("releases the slot on error", async () => {
    fire(QUERY_FETCH_LIMIT + 1);
    await flush();
    pending[0].reject(new Error("boom"));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(QUERY_FETCH_LIMIT + 1);
  });

  it("releases the slot exactly once when an in-flight request aborts", async () => {
    fetchMock.mockImplementation(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          pending.push({ resolve, reject }); // so afterEach drains the rest
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const ac = new AbortController();
    const first = limitedFetch("/api/query?0", { signal: ac.signal }).catch(
      () => undefined,
    );
    for (let i = 1; i < QUERY_FETCH_LIMIT + 2; i++) {
      limitedFetch(`/api/query?${i}`, {}).catch(() => undefined);
    }
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(QUERY_FETCH_LIMIT);
    ac.abort();
    await first;
    await flush();
    // One slot freed: exactly one waiter starts, not both.
    expect(fetchMock).toHaveBeenCalledTimes(QUERY_FETCH_LIMIT + 1);
  });
});
