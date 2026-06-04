import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock React Query -- we're testing the fetch logic, not the React wiring
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((config: Record<string, unknown>) => config),
  useMutation: vi.fn((config: Record<string, unknown>) => config),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

// Import after mocks are set up
const {
  useDashboards,
  useDashboard,
  useCreateDashboard,
  useUpdateDashboard,
  useDeleteDashboard,
  useDuplicateDashboard,
  useImportDashboard,
  useDashboardShares,
  useAssignDashboard,
  useRemoveDashboardShare,
} = await import("../use-dashboards");

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

describe("use-dashboards", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── useDashboards ───────────────────────────────────────────────────
  describe("useDashboards queryFn", () => {
    it("fetches from /api/dashboards with default limit and offset", async () => {
      const dashboards = [{ id: "d1", name: "Sales" }];
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(dashboards),
      );
      const config = useDashboards() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      const result = await config.queryFn();
      expect(result).toEqual(dashboards);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/dashboards?limit=100&offset=0",
      );
    });

    it("returns envelope data when response uses envelope format", async () => {
      const dashboards = [{ id: "d1", name: "Sales" }];
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ data: dashboards, error: null, meta: null }),
      );
      const config = useDashboards() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      const result = await config.queryFn();
      expect(result).toEqual(dashboards);
    });

    it("passes custom limit and offset", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse([]));
      const config = useDashboards(25, 50) as unknown as {
        queryFn: () => Promise<unknown>;
      };
      await config.queryFn();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/dashboards?limit=25&offset=50",
      );
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Unauthorized" }, 401),
      );
      const config = useDashboards() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      await expect(config.queryFn()).rejects.toThrow("Unauthorized");
    });
  });

  // ── useDashboard ────────────────────────────────────────────────────
  describe("useDashboard queryFn", () => {
    it("fetches from /api/dashboards/:id", async () => {
      const dashboard = { id: "d1", name: "Sales", layoutJson: null };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(dashboard),
      );
      const config = useDashboard("d1") as unknown as {
        queryFn: () => Promise<unknown>;
        enabled: boolean;
      };
      const result = await config.queryFn();
      expect(result).toEqual(dashboard);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/dashboards/d1");
    });

    it("is enabled only when id is truthy", () => {
      const configWithId = useDashboard("d1") as unknown as {
        enabled: boolean;
      };
      expect(configWithId.enabled).toBe(true);

      const configEmpty = useDashboard("") as unknown as {
        enabled: boolean;
      };
      expect(configEmpty.enabled).toBe(false);
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Not found" }, 404),
      );
      const config = useDashboard("bad-id") as unknown as {
        queryFn: () => Promise<unknown>;
      };
      await expect(config.queryFn()).rejects.toThrow("Not found");
    });
  });

  // ── useCreateDashboard ──────────────────────────────────────────────
  describe("useCreateDashboard mutationFn", () => {
    it("POSTs to /api/dashboards with name and description", async () => {
      const input = { name: "New Dashboard", description: "A test" };
      const created = { id: "d2", name: "New Dashboard" };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(created),
      );
      const config = useCreateDashboard() as unknown as {
        mutationFn: (i: typeof input) => Promise<unknown>;
      };
      const result = await config.mutationFn(input);
      expect(result).toEqual(created);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/dashboards", {
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
            error: { message: "Validation error", code: "VALIDATION" },
            meta: null,
          },
          400,
        ),
      );
      const config = useCreateDashboard() as unknown as {
        mutationFn: (i: unknown) => Promise<unknown>;
      };
      await expect(config.mutationFn({ name: "" })).rejects.toThrow(
        "Validation error",
      );
    });
  });

  // ── useUpdateDashboard ──────────────────────────────────────────────
  describe("useUpdateDashboard mutationFn + onSuccess", () => {
    it("PUTs to /api/dashboards/:id with body + expectedVersion", async () => {
      const input = {
        id: "d-abc",
        name: "Renamed",
        expectedVersion: 7,
      };
      const updated = { id: "d-abc", name: "Renamed", version: 8 };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(updated),
      );
      const config = useUpdateDashboard() as unknown as {
        mutationFn: (i: typeof input) => Promise<unknown>;
      };
      const result = await config.mutationFn(input);
      expect(result).toEqual(updated);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/dashboards/d-abc",
        expect.objectContaining({ method: "PUT" }),
      );
    });

    // Helper: stub both `window` (for the gate) and the bare `sessionStorage`
    // global (which the hook calls directly, matching the codebase's usage in
    // `[id]/page.tsx`). Node test env doesn't provide either.
    function withMockSessionStorage(
      run: (setItem: ReturnType<typeof vi.fn>) => void,
    ) {
      const setItem = vi.fn();
      vi.stubGlobal("window", {
        sessionStorage: { setItem, getItem: vi.fn(), removeItem: vi.fn() },
      });
      vi.stubGlobal("sessionStorage", {
        setItem,
        getItem: vi.fn(),
        removeItem: vi.fn(),
      });
      try {
        run(setItem);
      } finally {
        vi.unstubAllGlobals();
      }
    }

    it("onSuccess writes new version to sessionStorage", () => {
      withMockSessionStorage((setItem) => {
        const config = useUpdateDashboard() as unknown as {
          onSuccess: (
            result: { version: number },
            variables: { id: string },
          ) => void;
        };
        config.onSuccess({ version: 42 }, { id: "d-xyz" });
        expect(setItem).toHaveBeenCalledWith("__nb_dash_ver_d-xyz", "42");
      });
    });

    it("onSuccess skips sessionStorage write when result has no version", () => {
      withMockSessionStorage((setItem) => {
        const config = useUpdateDashboard() as unknown as {
          onSuccess: (
            result: { version?: number },
            variables: { id: string },
          ) => void;
        };
        config.onSuccess({}, { id: "d-no-version" });
        expect(setItem).not.toHaveBeenCalled();
      });
    });

    it("onSuccess skips sessionStorage write when version is not a number", () => {
      withMockSessionStorage((setItem) => {
        const config = useUpdateDashboard() as unknown as {
          onSuccess: (
            result: { version: unknown },
            variables: { id: string },
          ) => void;
        };
        config.onSuccess(
          { version: "8" as unknown as number },
          { id: "d-bad" },
        );
        expect(setItem).not.toHaveBeenCalled();
      });
    });
  });

  // ── useDeleteDashboard ──────────────────────────────────────────────
  describe("useDeleteDashboard mutationFn", () => {
    it("DELETEs the dashboard by id", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ success: true }),
      );
      const config = useDeleteDashboard() as unknown as {
        mutationFn: (id: string) => Promise<unknown>;
      };
      const result = await config.mutationFn("d1");
      expect(result).toEqual({ success: true });
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/dashboards/d1", {
        method: "DELETE",
      });
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Forbidden" }, 403),
      );
      const config = useDeleteDashboard() as unknown as {
        mutationFn: (id: string) => Promise<unknown>;
      };
      await expect(config.mutationFn("d1")).rejects.toThrow("Forbidden");
    });
  });

  // ── useDuplicateDashboard ───────────────────────────────────────────
  describe("useDuplicateDashboard mutationFn", () => {
    it("POSTs to /api/dashboards/:id/duplicate", async () => {
      const duplicated = { id: "d3", name: "Sales (Copy)" };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(duplicated),
      );
      const config = useDuplicateDashboard() as unknown as {
        mutationFn: (id: string) => Promise<unknown>;
      };
      const result = await config.mutationFn("d1");
      expect(result).toEqual(duplicated);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/dashboards/d1/duplicate",
        { method: "POST" },
      );
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Not found" }, 404),
      );
      const config = useDuplicateDashboard() as unknown as {
        mutationFn: (id: string) => Promise<unknown>;
      };
      await expect(config.mutationFn("bad")).rejects.toThrow("Not found");
    });
  });

  // ── useImportDashboard ──────────────────────────────────────────────
  describe("useImportDashboard mutationFn", () => {
    it("POSTs to /api/dashboards/import with payload and mapping", async () => {
      const input = {
        payload: { name: "Imported" },
        connectionMapping: { old1: "new1" },
      };
      const imported = { id: "d4", name: "Imported" };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(imported),
      );
      const config = useImportDashboard() as unknown as {
        mutationFn: (i: typeof input) => Promise<unknown>;
      };
      const result = await config.mutationFn(input);
      expect(result).toEqual(imported);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/dashboards/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Invalid payload" }, 400),
      );
      const config = useImportDashboard() as unknown as {
        mutationFn: (i: unknown) => Promise<unknown>;
      };
      await expect(
        config.mutationFn({ payload: null, connectionMapping: {} }),
      ).rejects.toThrow("Invalid payload");
    });
  });

  // ── useDashboardShares ──────────────────────────────────────────────
  describe("useDashboardShares queryFn", () => {
    it("fetches from /api/dashboards/:id/share", async () => {
      const shares = [{ id: "s1", role: "viewer", userName: "Alice" }];
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse(shares));
      const config = useDashboardShares("d1") as unknown as {
        queryFn: () => Promise<unknown>;
        enabled: boolean;
      };
      const result = await config.queryFn();
      expect(result).toEqual(shares);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/dashboards/d1/share");
    });

    it("is enabled only when dashboardId is truthy", () => {
      const configWithId = useDashboardShares("d1") as unknown as {
        enabled: boolean;
      };
      expect(configWithId.enabled).toBe(true);

      const configEmpty = useDashboardShares("") as unknown as {
        enabled: boolean;
      };
      expect(configEmpty.enabled).toBe(false);
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Forbidden" }, 403),
      );
      const config = useDashboardShares("d1") as unknown as {
        queryFn: () => Promise<unknown>;
      };
      await expect(config.queryFn()).rejects.toThrow("Forbidden");
    });
  });

  // ── useAssignDashboard ──────────────────────────────────────────────
  describe("useAssignDashboard mutationFn", () => {
    it("POSTs to /api/dashboards/:id/share with email and role", async () => {
      const input = { email: "bob@example.com", role: "editor" as const };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ success: true }),
      );
      const config = useAssignDashboard("d1") as unknown as {
        mutationFn: (i: typeof input) => Promise<unknown>;
      };
      const result = await config.mutationFn(input);
      expect(result).toEqual({ success: true });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/dashboards/d1/share",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "User not found" }, 404),
      );
      const config = useAssignDashboard("d1") as unknown as {
        mutationFn: (i: unknown) => Promise<unknown>;
      };
      await expect(
        config.mutationFn({ email: "x", role: "viewer" }),
      ).rejects.toThrow("User not found");
    });
  });

  // ── useRemoveDashboardShare ─────────────────────────────────────────
  describe("useRemoveDashboardShare mutationFn", () => {
    it("DELETEs /api/dashboards/:id/share?shareId=:shareId", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ success: true }),
      );
      const config = useRemoveDashboardShare("d1") as unknown as {
        mutationFn: (shareId: string) => Promise<unknown>;
      };
      const result = await config.mutationFn("share-99");
      expect(result).toEqual({ success: true });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/dashboards/d1/share?shareId=share-99",
        { method: "DELETE" },
      );
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Not found" }, 404),
      );
      const config = useRemoveDashboardShare("d1") as unknown as {
        mutationFn: (shareId: string) => Promise<unknown>;
      };
      await expect(config.mutationFn("bad")).rejects.toThrow("Not found");
    });
  });
});
