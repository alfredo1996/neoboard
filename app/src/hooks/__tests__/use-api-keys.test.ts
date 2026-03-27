import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock React Query — we're testing the fetch logic, not the React wiring
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((config: Record<string, unknown>) => config),
  useMutation: vi.fn((config: Record<string, unknown>) => config),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

// Import after mocks are set up
const { useApiKeys, useCreateApiKey, useRevokeApiKey } =
  await import("../use-api-keys");

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

describe("use-api-keys", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("useApiKeys queryFn", () => {
    it("fetches from /api/keys and returns data", async () => {
      const keys = [{ id: "1", name: "test-key" }];
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse(keys));
      const config = useApiKeys() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      const result = await config.queryFn();
      expect(result).toEqual(keys);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/keys", undefined);
    });

    it("returns envelope data when response uses envelope format", async () => {
      const keys = [{ id: "1", name: "key" }];
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ data: keys }),
      );
      const config = useApiKeys() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      const result = await config.queryFn();
      expect(result).toEqual(keys);
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(
          { error: { message: "Unauthorized", code: "UNAUTHORIZED" } },
          401,
        ),
      );
      const config = useApiKeys() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      await expect(config.queryFn()).rejects.toThrow("Unauthorized");
    });
  });

  describe("useCreateApiKey mutationFn", () => {
    it("POSTs to /api/keys with name and expiresAt", async () => {
      const created = {
        id: "2",
        name: "new-key",
        key: "sk-abc",
        createdAt: "2026-01-01",
        expiresAt: null,
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(created),
      );
      const config = useCreateApiKey() as unknown as {
        mutationFn: (input: {
          name: string;
          expiresAt?: string;
        }) => Promise<unknown>;
      };
      const result = await config.mutationFn({ name: "new-key" });
      expect(result).toEqual(created);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "new-key" }),
      });
    });
  });

  describe("useRevokeApiKey mutationFn", () => {
    it("DELETEs the key by id", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ success: true }),
      );
      const config = useRevokeApiKey() as unknown as {
        mutationFn: (id: string) => Promise<unknown>;
      };
      const result = await config.mutationFn("key-123");
      expect(result).toEqual({ success: true });
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/keys/key-123", {
        method: "DELETE",
      });
    });
  });
});
