import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock React Query -- we're testing the fetch logic, not the React wiring
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((config: Record<string, unknown>) => config),
  useMutation: vi.fn((config: Record<string, unknown>) => config),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

// Import after mocks are set up
const {
  useConnections,
  useCreateConnection,
  useDeleteConnection,
  useUpdateConnection,
  useTestConnection,
  useTestInlineConnection,
} = await import("../use-connections");

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

describe("use-connections", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── useConnections ──────────────────────────────────────────────────
  describe("useConnections queryFn", () => {
    it("fetches from /api/connections with default limit and offset", async () => {
      const connections = [{ id: "c1", name: "My Neo4j" }];
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(connections),
      );
      const config = useConnections() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      const result = await config.queryFn();
      expect(result).toEqual(connections);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/connections?limit=100&offset=0",
      );
    });

    it("returns envelope data when response uses envelope format", async () => {
      const connections = [{ id: "c1", name: "PG" }];
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ data: connections, error: null, meta: null }),
      );
      const config = useConnections() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      const result = await config.queryFn();
      expect(result).toEqual(connections);
    });

    it("passes custom limit and offset", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse([]));
      const config = useConnections({ limit: 50, offset: 10 }) as unknown as {
        queryFn: () => Promise<unknown>;
      };
      await config.queryFn();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/connections?limit=50&offset=10",
      );
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Unauthorized" }, 401),
      );
      const config = useConnections() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      await expect(config.queryFn()).rejects.toThrow("Unauthorized");
    });
  });

  // ── useCreateConnection ─────────────────────────────────────────────
  describe("useCreateConnection mutationFn", () => {
    it("POSTs to /api/connections with the connection input", async () => {
      const input = {
        name: "Test DB",
        type: "neo4j" as const,
        config: {
          uri: "bolt://localhost:7687",
          username: "neo4j",
          password: "pass",
        },
      };
      const created = { id: "c2", name: "Test DB" };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(created),
      );
      const config = useCreateConnection() as unknown as {
        mutationFn: (i: typeof input) => Promise<unknown>;
      };
      const result = await config.mutationFn(input);
      expect(result).toEqual(created);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(
          {
            data: null,
            error: { message: "Validation failed", code: "VALIDATION" },
            meta: null,
          },
          400,
        ),
      );
      const config = useCreateConnection() as unknown as {
        mutationFn: (i: unknown) => Promise<unknown>;
      };
      await expect(
        config.mutationFn({ name: "x", type: "neo4j", config: {} }),
      ).rejects.toThrow("Validation failed");
    });
  });

  // ── useDeleteConnection ─────────────────────────────────────────────
  describe("useDeleteConnection mutationFn", () => {
    it("DELETEs the connection by id without force by default", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ success: true }),
      );
      const config = useDeleteConnection() as unknown as {
        mutationFn: (args: { id: string; force?: boolean }) => Promise<unknown>;
      };
      const result = await config.mutationFn({ id: "conn-42" });
      expect(result).toEqual({ success: true });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/connections/conn-42",
        { method: "DELETE" },
      );
    });

    it("appends ?force=true when force is set (after in-use warning)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ success: true }),
      );
      const config = useDeleteConnection() as unknown as {
        mutationFn: (args: { id: string; force?: boolean }) => Promise<unknown>;
      };
      await config.mutationFn({ id: "conn-99", force: true });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/connections/conn-99?force=true",
        { method: "DELETE" },
      );
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Not found" }, 404),
      );
      const config = useDeleteConnection() as unknown as {
        mutationFn: (args: { id: string; force?: boolean }) => Promise<unknown>;
      };
      await expect(config.mutationFn({ id: "bad-id" })).rejects.toThrow(
        "Not found",
      );
    });
  });

  // ── useConnectionUsage ──────────────────────────────────────────────
  describe("useConnectionUsage queryFn", () => {
    it("GETs /api/connections/{id}/usage and returns the envelope data", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({
          widgetCount: 3,
          dashboards: [
            { id: "d1", name: "Sales", widgetCount: 2 },
            { id: "d2", name: "Inventory", widgetCount: 1 },
          ],
        }),
      );
      // Dynamic import so the module pick-up matches the other tests.
      const { useConnectionUsage } = await import("../use-connections");
      const config = useConnectionUsage("conn-1") as unknown as {
        queryFn: () => Promise<unknown>;
      };
      const result = await config.queryFn();
      expect(result).toEqual({
        widgetCount: 3,
        dashboards: [
          { id: "d1", name: "Sales", widgetCount: 2 },
          { id: "d2", name: "Inventory", widgetCount: 1 },
        ],
      });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/connections/conn-1/usage",
      );
    });
  });

  // ── useUpdateConnection ─────────────────────────────────────────────
  describe("useUpdateConnection mutationFn", () => {
    it("PATCHes /api/connections/:id with body excluding id", async () => {
      const updated = { id: "c1", name: "Renamed" };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(updated),
      );
      const config = useUpdateConnection() as unknown as {
        mutationFn: (i: { id: string; name?: string }) => Promise<unknown>;
      };
      const result = await config.mutationFn({ id: "c1", name: "Renamed" });
      expect(result).toEqual(updated);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/connections/c1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renamed" }),
      });
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Forbidden" }, 403),
      );
      const config = useUpdateConnection() as unknown as {
        mutationFn: (i: { id: string }) => Promise<unknown>;
      };
      await expect(config.mutationFn({ id: "c1" })).rejects.toThrow(
        "Forbidden",
      );
    });
  });

  // ── useTestConnection ───────────────────────────────────────────────
  describe("useTestConnection mutationFn", () => {
    it("POSTs to /api/connections/:id/test", async () => {
      const body = { success: true };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse(body));
      const config = useTestConnection() as unknown as {
        mutationFn: (id: string) => Promise<unknown>;
      };
      const result = await config.mutationFn("c5");
      expect(result).toEqual(body);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/connections/c5/test",
        { method: "POST" },
      );
    });

    it("returns error detail when test fails", async () => {
      const body = { success: false, error: "Connection refused" };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse(body));
      const config = useTestConnection() as unknown as {
        mutationFn: (id: string) => Promise<unknown>;
      };
      const result = await config.mutationFn("c5");
      expect(result).toEqual(body);
    });

    it("throws on non-ok response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Not found" }, 404),
      );
      const config = useTestConnection() as unknown as {
        mutationFn: (id: string) => Promise<unknown>;
      };
      await expect(config.mutationFn("bad")).rejects.toThrow("Not found");
    });
  });

  // ── useTestInlineConnection ─────────────────────────────────────────
  describe("useTestInlineConnection mutationFn", () => {
    it("POSTs to /api/connections/test-inline with inline config", async () => {
      const input = {
        type: "postgresql" as const,
        config: {
          uri: "postgres://localhost:5432/test",
          username: "pg",
          password: "secret",
        },
      };
      const body = { success: true };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse(body));
      const config = useTestInlineConnection() as unknown as {
        mutationFn: (i: typeof input) => Promise<unknown>;
      };
      const result = await config.mutationFn(input);
      expect(result).toEqual(body);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/connections/test-inline",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Bad config" }, 400),
      );
      const config = useTestInlineConnection() as unknown as {
        mutationFn: (i: unknown) => Promise<unknown>;
      };
      await expect(
        config.mutationFn({ type: "neo4j", config: {} }),
      ).rejects.toThrow("Bad config");
    });
  });
});
