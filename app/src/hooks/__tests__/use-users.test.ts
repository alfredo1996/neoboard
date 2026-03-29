import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock React Query -- we're testing the fetch logic, not the React wiring
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((config: Record<string, unknown>) => config),
  useMutation: vi.fn((config: Record<string, unknown>) => config),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

// Import after mocks are set up
const {
  useUsers,
  useCreateUser,
  useUpdateUserRole,
  useUpdateUserCanWrite,
  useDeleteUser,
} = await import("../use-users");

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

describe("use-users", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── useUsers ────────────────────────────────────────────────────────
  describe("useUsers queryFn", () => {
    it("fetches from /api/users and returns data", async () => {
      const users = [{ id: "u1", name: "Alice", role: "admin" }];
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse(users));
      const config = useUsers() as unknown as {
        queryFn: () => Promise<unknown>;
        retry: (count: number, error: Error) => boolean;
      };
      const result = await config.queryFn();
      expect(result).toEqual(users);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/users");
    });

    it("returns envelope data when response uses envelope format", async () => {
      const users = [{ id: "u1", name: "Bob" }];
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ data: users, error: null, meta: null }),
      );
      const config = useUsers() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      const result = await config.queryFn();
      expect(result).toEqual(users);
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Unauthorized" }, 401),
      );
      const config = useUsers() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      await expect(config.queryFn()).rejects.toThrow("Unauthorized");
    });

    it("does not retry on 403 Forbidden errors", () => {
      const config = useUsers() as unknown as {
        retry: (count: number, error: Error) => boolean;
      };
      const forbiddenError = new Error("Forbidden");
      expect(config.retry(0, forbiddenError)).toBe(false);
    });

    it("retries on non-Forbidden errors", () => {
      const config = useUsers() as unknown as {
        retry: (count: number, error: Error) => boolean;
      };
      const networkError = new Error("Network error");
      expect(config.retry(0, networkError)).toBe(true);
    });
  });

  // ── useCreateUser ───────────────────────────────────────────────────
  describe("useCreateUser mutationFn", () => {
    it("POSTs to /api/users with user input", async () => {
      const input = {
        name: "Charlie",
        email: "charlie@example.com",
        password: "secret123",
        role: "viewer" as const,
      };
      const created = {
        id: "u2",
        name: "Charlie",
        email: "charlie@example.com",
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(created),
      );
      const config = useCreateUser() as unknown as {
        mutationFn: (i: typeof input) => Promise<unknown>;
      };
      const result = await config.mutationFn(input);
      expect(result).toEqual(created);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/users", {
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
            error: { message: "Email already exists", code: "CONFLICT" },
            meta: null,
          },
          409,
        ),
      );
      const config = useCreateUser() as unknown as {
        mutationFn: (i: unknown) => Promise<unknown>;
      };
      await expect(
        config.mutationFn({ name: "x", email: "x", password: "x" }),
      ).rejects.toThrow("Email already exists");
    });
  });

  // ── useUpdateUserRole ───────────────────────────────────────────────
  describe("useUpdateUserRole mutationFn", () => {
    it("PATCHes /api/users/:id with { role }", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ success: true }),
      );
      const config = useUpdateUserRole() as unknown as {
        mutationFn: (i: { id: string; role: string }) => Promise<unknown>;
      };
      const result = await config.mutationFn({ id: "u1", role: "editor" });
      expect(result).toEqual({ success: true });
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/users/u1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "editor" }),
      });
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Forbidden" }, 403),
      );
      const config = useUpdateUserRole() as unknown as {
        mutationFn: (i: { id: string; role: string }) => Promise<unknown>;
      };
      await expect(
        config.mutationFn({ id: "u1", role: "admin" }),
      ).rejects.toThrow("Forbidden");
    });
  });

  // ── useUpdateUserCanWrite ───────────────────────────────────────────
  describe("useUpdateUserCanWrite mutationFn", () => {
    it("PATCHes /api/users/:id with { canWrite }", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ success: true }),
      );
      const config = useUpdateUserCanWrite() as unknown as {
        mutationFn: (i: { id: string; canWrite: boolean }) => Promise<unknown>;
      };
      const result = await config.mutationFn({ id: "u1", canWrite: true });
      expect(result).toEqual({ success: true });
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/users/u1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canWrite: true }),
      });
    });

    it("sends canWrite: false correctly", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ success: true }),
      );
      const config = useUpdateUserCanWrite() as unknown as {
        mutationFn: (i: { id: string; canWrite: boolean }) => Promise<unknown>;
      };
      await config.mutationFn({ id: "u2", canWrite: false });
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/users/u2", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canWrite: false }),
      });
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Forbidden" }, 403),
      );
      const config = useUpdateUserCanWrite() as unknown as {
        mutationFn: (i: { id: string; canWrite: boolean }) => Promise<unknown>;
      };
      await expect(
        config.mutationFn({ id: "u1", canWrite: true }),
      ).rejects.toThrow("Forbidden");
    });
  });

  // ── useDeleteUser ───────────────────────────────────────────────────
  describe("useDeleteUser mutationFn", () => {
    it("DELETEs the user by id", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ success: true }),
      );
      const config = useDeleteUser() as unknown as {
        mutationFn: (id: string) => Promise<unknown>;
      };
      const result = await config.mutationFn("u3");
      expect(result).toEqual({ success: true });
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/users/u3", {
        method: "DELETE",
      });
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Cannot delete yourself" }, 400),
      );
      const config = useDeleteUser() as unknown as {
        mutationFn: (id: string) => Promise<unknown>;
      };
      await expect(config.mutationFn("u1")).rejects.toThrow(
        "Cannot delete yourself",
      );
    });
  });
});
