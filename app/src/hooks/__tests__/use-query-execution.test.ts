import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock React Query -- we're testing the fetch logic, not the React wiring
vi.mock("@tanstack/react-query", () => ({
  useMutation: vi.fn((config: Record<string, unknown>) => config),
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
        meta: { resultId: "r-123" },
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
      });
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
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
