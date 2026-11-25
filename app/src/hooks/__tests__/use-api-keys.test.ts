import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock React Query — we're testing the fetch logic, not the React wiring
const { QueryClient, QueryObserver } = await vi.importActual<
  typeof import("@tanstack/react-query")
>("@tanstack/react-query");
const queryClient = new QueryClient();

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((config: Record<string, unknown>) => config),
  useMutation: vi.fn((config: Record<string, unknown>) => config),
  useQueryClient: vi.fn(() => queryClient),
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
        mockResponse({ data: keys, error: null, meta: null }),
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
          {
            data: null,
            error: { message: "Unauthorized", code: "UNAUTHORIZED" },
            meta: null,
          },
          401,
        ),
      );
      const config = useApiKeys() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      await expect(config.queryFn()).rejects.toThrow("Unauthorized");
    });

    it("names a proxy when a 403 answers with HTML (#2487)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.reject(new SyntaxError("Unexpected token <")),
      } as Response);
      const config = useApiKeys() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      await expect(config.queryFn()).rejects.toThrow(
        /response could not be read \(HTTP 403\)/,
      );
    });
  });

  describe("useCreateApiKey mutationFn", () => {
    it("returns the one-time key from the apiSuccess envelope the route sends (#2487)", async () => {
      const created = { id: "2", name: "k", key: "sk-abc" };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ data: created, error: null, meta: null }, 201),
      );
      const config = useCreateApiKey() as unknown as {
        mutationFn: (input: { name: string }) => Promise<unknown>;
      };
      expect(await config.mutationFn({ name: "k" })).toEqual(created);
    });

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
      const config = useCreateApiKey() as unknown as {
        mutationFn: (input: { name: string }) => Promise<unknown>;
      };
      await expect(config.mutationFn({ name: "" })).rejects.toThrow(
        "Validation failed",
      );
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

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(
          {
            data: null,
            error: { message: "Not found", code: "NOT_FOUND" },
            meta: null,
          },
          404,
        ),
      );
      const config = useRevokeApiKey() as unknown as {
        mutationFn: (id: string) => Promise<unknown>;
      };
      await expect(config.mutationFn("bad-id")).rejects.toThrow("Not found");
    });
  });

  describe("useCreateApiKey onSuccess (#2569)", () => {
    const existing = { id: "1", name: "old" };
    const created = {
      id: "2",
      name: "new",
      keyPrefix: "nb_ab",
      key: "nb_secret",
    };
    const config = useCreateApiKey() as unknown as {
      onSuccess: (c: typeof created) => Promise<void>;
    };
    const onSuccess = () => config.onSuccess(created);
    const ids = () =>
      queryClient
        .getQueryData<{ id: string }[]>(["api-keys"])
        ?.map((k) => k.id);

    beforeEach(() => queryClient.clear());

    it("keeps the new key when the first list GET, issued before the POST, resolves without it", async () => {
      // The first load is in flight with no data: an invalidate alone would
      // join it, and nothing would refetch afterwards.
      const pending: ((rows: unknown[]) => void)[] = [];
      const queryFn = vi.fn(
        () => new Promise<unknown[]>((r) => pending.push(r)),
      );
      const unsubscribe = new QueryObserver(queryClient, {
        queryKey: ["api-keys"],
        queryFn,
      }).subscribe(() => {});
      expect(queryFn).toHaveBeenCalledTimes(1);

      await onSuccess();
      pending[0]([existing]); // the stale GET lands without the new key
      await new Promise((r) => setTimeout(r, 10));

      expect(ids()).toEqual(["2"]);
      expect(queryFn).toHaveBeenCalledTimes(2);
      expect(
        JSON.stringify(
          queryClient
            .getQueryCache()
            .getAll()
            .map((q) => q.state),
        ),
      ).not.toContain("nb_secret");
      unsubscribe();
    });

    it("appends the row once, after the existing ones, when the cache already holds it", async () => {
      queryClient.setQueryData(["api-keys"], [existing]);
      await onSuccess();
      expect(ids()).toEqual(["1", "2"]);

      queryClient.setQueryData(["api-keys"], [existing, { id: "2" }]);
      await onSuccess();
      expect(ids()).toEqual(["1", "2"]);
    });
  });
});
