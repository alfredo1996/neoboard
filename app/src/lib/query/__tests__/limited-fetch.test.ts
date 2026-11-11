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

  it("never fetches a waiter whose signal aborts while it waits", async () => {
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
  });

  it("releases the slot on error", async () => {
    fire(QUERY_FETCH_LIMIT + 1);
    await flush();
    pending[0].reject(new Error("boom"));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(QUERY_FETCH_LIMIT + 1);
  });

  it("releases the slot when an in-flight request aborts", async () => {
    fire(QUERY_FETCH_LIMIT + 1);
    await flush();
    pending[0].reject(new DOMException("aborted", "AbortError"));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(QUERY_FETCH_LIMIT + 1);
  });
});
