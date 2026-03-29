import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock React Query -- we're testing the fetch logic, not the React wiring
vi.mock("@tanstack/react-query", () => ({
  useMutation: vi.fn((config: Record<string, unknown>) => config),
}));

// Import after mocks are set up
const { useWriteQueryExecution } = await import("../use-write-query-execution");

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

describe("use-write-query-execution", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("useWriteQueryExecution mutationFn", () => {
    it("POSTs to /api/query/write with connectionId, query, and params", async () => {
      const input = {
        connectionId: "c1",
        query: "CREATE (n:Node {name: $name}) RETURN n",
        params: { name: "test" },
      };
      const responseBody = {
        data: { affected: 1 },
        error: null,
        meta: { serverDurationMs: 15 },
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(responseBody),
      );
      const config = useWriteQueryExecution() as unknown as {
        mutationFn: (i: typeof input) => Promise<unknown>;
      };
      const result = await config.mutationFn(input);
      expect(result).toEqual({
        data: { affected: 1 },
        serverDurationMs: 15,
      });
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/query/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    });

    it("works without params", async () => {
      const input = {
        connectionId: "c2",
        query: "INSERT INTO test DEFAULT VALUES",
      };
      const responseBody = {
        data: { rowCount: 1 },
        error: null,
        meta: { serverDurationMs: 8 },
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(responseBody),
      );
      const config = useWriteQueryExecution() as unknown as {
        mutationFn: (i: typeof input) => Promise<unknown>;
      };
      const result = await config.mutationFn(input);
      expect(result).toEqual({
        data: { rowCount: 1 },
        serverDurationMs: 8,
      });
    });

    it("merges data and meta from envelope response", async () => {
      const responseBody = {
        data: [{ id: 1 }],
        error: null,
        meta: { serverDurationMs: 25, extra: "info" },
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(responseBody),
      );
      const config = useWriteQueryExecution() as unknown as {
        mutationFn: (i: {
          connectionId: string;
          query: string;
        }) => Promise<unknown>;
      };
      const result = await config.mutationFn({
        connectionId: "c1",
        query: "DELETE FROM test",
      });
      expect(result).toEqual({
        data: [{ id: 1 }],
        serverDurationMs: 25,
        extra: "info",
      });
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(
          {
            data: null,
            error: { message: "Write not allowed", code: "FORBIDDEN" },
            meta: null,
          },
          403,
        ),
      );
      const config = useWriteQueryExecution() as unknown as {
        mutationFn: (i: {
          connectionId: string;
          query: string;
        }) => Promise<unknown>;
      };
      await expect(
        config.mutationFn({ connectionId: "c1", query: "DROP TABLE x" }),
      ).rejects.toThrow("Write not allowed");
    });

    it("throws on raw error response (non-envelope)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Unauthorized" }, 401),
      );
      const config = useWriteQueryExecution() as unknown as {
        mutationFn: (i: {
          connectionId: string;
          query: string;
        }) => Promise<unknown>;
      };
      await expect(
        config.mutationFn({ connectionId: "c1", query: "INSERT INTO x" }),
      ).rejects.toThrow("Unauthorized");
    });
  });
});
