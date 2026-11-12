import { describe, it, expect, vi, beforeEach } from "vitest";

// The hook keeps its previous run in a ref; outside a component a ref is a box.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => unknown) => {
    unmounts.push(effect() as () => void);
  },
}));
const unmounts: Array<() => void> = vi.hoisted(() => []);
const reset = vi.hoisted(() => vi.fn());

// Mock React Query -- we're testing the fetch logic, not the React wiring
vi.mock("@tanstack/react-query", () => ({
  useMutation: vi.fn((config: Record<string, unknown>) => ({
    ...config,
    reset: reset,
  })),
}));

// Import after mocks are set up
const { useQueryExecution } = await import("../use-query-execution");

// ---------------------------------------------------------------------------
// Helper to create a mock Response
// ---------------------------------------------------------------------------
function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("use-query-execution", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("useQueryExecution mutationFn", () => {
    it("POSTs to /api/query with connectionId, query, and params", async () => {
      const input = {
        connectionId: "c1",
        query: "MATCH (n) RETURN n",
        params: { limit: 10 },
      };
      const responseBody = {
        data: { data: [{ n: "node1" }], fields: ["n"] },
        error: null,
        meta: { resultId: "r-123", serverDurationMs: 118 },
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(responseBody),
      );
      const config = useQueryExecution() as unknown as {
        mutationFn: (i: typeof input) => Promise<unknown>;
      };
      const result = await config.mutationFn(input);
      expect(result).toEqual({
        data: [{ n: "node1" }],
        fields: ["n"],
        resultId: "r-123",
        serverDurationMs: 118,
      });
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: expect.any(AbortSignal),
      });
    });

    it("aborts a running run when the component unmounts (#2444)", async () => {
      let signal: AbortSignal | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementationOnce((_u, init) => {
        signal = init?.signal ?? undefined;
        return new Promise(() => {});
      });
      const config = useQueryExecution() as unknown as {
        mutationFn: (i: unknown) => Promise<unknown>;
      };
      void config.mutationFn({ connectionId: "c1", query: "q" });
      await vi.waitFor(() => expect(signal).toBeDefined());
      expect(signal?.aborted).toBe(false);
      unmounts.at(-1)?.();
      expect(signal?.aborted).toBe(true);
    });

    it("stop aborts the in-flight request and resets the mutation (#2445)", async () => {
      let signal: AbortSignal | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementationOnce((_u, init) => {
        signal = init?.signal ?? undefined;
        return new Promise(() => {});
      });
      const hook = useQueryExecution() as unknown as {
        mutationFn: (i: unknown) => Promise<unknown>;
        stop: () => void;
      };
      void hook.mutationFn({ connectionId: "c1", query: "q" });
      await vi.waitFor(() => expect(signal).toBeDefined());
      hook.stop();
      expect(signal?.aborted).toBe(true);
      expect(reset).toHaveBeenCalledTimes(1);
    });

    it("aborts its previous run when a new run starts (#2444)", async () => {
      const signals: AbortSignal[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url, init) =>
          new Promise<Response>((resolve) => {
            signals.push(init!.signal!);
            resolve(
              mockResponse({ data: { data: [] }, error: null, meta: {} }),
            );
          }),
      );
      const config = useQueryExecution() as unknown as {
        mutationFn: (i: unknown) => Promise<unknown>;
      };
      await config.mutationFn({ connectionId: "c1", query: "SELECT 1" });
      expect(signals[0].aborted).toBe(false);
      await config.mutationFn({ connectionId: "c1", query: "SELECT 2" });
      expect(signals[0].aborted).toBe(true);
      expect(signals[1].aborted).toBe(false);
    });

    it("works without params", async () => {
      const input = {
        connectionId: "c2",
        query: "SELECT 1",
      };
      const responseBody = {
        data: { data: [{ "?column?": 1 }], fields: ["?column?"] },
        error: null,
        meta: { resultId: "r-456" },
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(responseBody),
      );
      const config = useQueryExecution() as unknown as {
        mutationFn: (i: typeof input) => Promise<unknown>;
      };
      const result = await config.mutationFn(input);
      expect(result).toEqual({
        data: [{ "?column?": 1 }],
        fields: ["?column?"],
        resultId: "r-456",
      });
    });

    it("merges data and meta from envelope response", async () => {
      const responseBody = {
        data: { data: [], fields: [] },
        error: null,
        meta: { resultId: "r-789", serverDurationMs: 42 },
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(responseBody),
      );
      const config = useQueryExecution() as unknown as {
        mutationFn: (i: {
          connectionId: string;
          query: string;
        }) => Promise<unknown>;
      };
      const result = await config.mutationFn({
        connectionId: "c1",
        query: "RETURN 1",
      });
      // data spread + meta spread
      expect(result).toEqual({
        data: [],
        fields: [],
        resultId: "r-789",
        serverDurationMs: 42,
      });
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(
          {
            data: null,
            error: { message: "Query timeout", code: "TIMEOUT" },
            meta: null,
          },
          500,
        ),
      );
      const config = useQueryExecution() as unknown as {
        mutationFn: (i: {
          connectionId: string;
          query: string;
        }) => Promise<unknown>;
      };
      await expect(
        config.mutationFn({ connectionId: "c1", query: "BAD" }),
      ).rejects.toThrow("Query timeout");
    });

    it("throws on raw error response (non-envelope)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Unauthorized" }, 401),
      );
      const config = useQueryExecution() as unknown as {
        mutationFn: (i: {
          connectionId: string;
          query: string;
        }) => Promise<unknown>;
      };
      await expect(
        config.mutationFn({ connectionId: "c1", query: "SELECT 1" }),
      ).rejects.toThrow("Unauthorized");
    });
  });
});
