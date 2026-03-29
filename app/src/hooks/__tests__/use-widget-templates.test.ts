import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock React Query -- we're testing the fetch logic, not the React wiring
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((config: Record<string, unknown>) => config),
  useMutation: vi.fn((config: Record<string, unknown>) => config),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

// Import after mocks are set up
const {
  useWidgetTemplates,
  useCreateWidgetTemplate,
  useUpdateWidgetTemplate,
  useDeleteWidgetTemplate,
} = await import("../use-widget-templates");

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

describe("use-widget-templates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── useWidgetTemplates ──────────────────────────────────────────────
  describe("useWidgetTemplates queryFn", () => {
    it("fetches from /api/widget-templates without filters", async () => {
      const templates = [{ id: "t1", name: "Bar Chart" }];
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(templates),
      );
      const config = useWidgetTemplates() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      const result = await config.queryFn();
      expect(result).toEqual(templates);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/widget-templates",
        undefined,
      );
    });

    it("appends chartType query param when provided", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse([]));
      const config = useWidgetTemplates({
        chartType: "bar",
      }) as unknown as {
        queryFn: () => Promise<unknown>;
      };
      await config.queryFn();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/widget-templates?chartType=bar",
        undefined,
      );
    });

    it("appends connectorType query param when provided", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse([]));
      const config = useWidgetTemplates({
        connectorType: "neo4j",
      }) as unknown as {
        queryFn: () => Promise<unknown>;
      };
      await config.queryFn();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/widget-templates?connectorType=neo4j",
        undefined,
      );
    });

    it("appends both query params when both provided", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse([]));
      const config = useWidgetTemplates({
        chartType: "pie",
        connectorType: "postgresql",
      }) as unknown as {
        queryFn: () => Promise<unknown>;
      };
      await config.queryFn();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/widget-templates?chartType=pie&connectorType=postgresql",
        undefined,
      );
    });

    it("returns envelope data when response uses envelope format", async () => {
      const templates = [{ id: "t1", name: "Line" }];
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ data: templates, error: null, meta: null }),
      );
      const config = useWidgetTemplates() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      const result = await config.queryFn();
      expect(result).toEqual(templates);
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Unauthorized" }, 401),
      );
      const config = useWidgetTemplates() as unknown as {
        queryFn: () => Promise<unknown>;
      };
      await expect(config.queryFn()).rejects.toThrow("Unauthorized");
    });
  });

  // ── useCreateWidgetTemplate ─────────────────────────────────────────
  describe("useCreateWidgetTemplate mutationFn", () => {
    it("POSTs to /api/widget-templates with the template input", async () => {
      const input = {
        name: "My Template",
        chartType: "bar",
        connectorType: "neo4j" as const,
        query: "MATCH (n) RETURN n LIMIT 10",
      };
      const created = { id: "t2", name: "My Template" };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(created),
      );
      const config = useCreateWidgetTemplate() as unknown as {
        mutationFn: (i: typeof input) => Promise<unknown>;
      };
      const result = await config.mutationFn(input);
      expect(result).toEqual(created);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/widget-templates", {
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
      const config = useCreateWidgetTemplate() as unknown as {
        mutationFn: (i: unknown) => Promise<unknown>;
      };
      await expect(
        config.mutationFn({
          name: "",
          chartType: "bar",
          connectorType: "neo4j",
        }),
      ).rejects.toThrow("Validation error");
    });
  });

  // ── useUpdateWidgetTemplate ─────────────────────────────────────────
  describe("useUpdateWidgetTemplate mutationFn", () => {
    it("PUTs to /api/widget-templates/:id with body excluding id", async () => {
      const updated = { id: "t1", name: "Updated Template" };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse(updated),
      );
      const config = useUpdateWidgetTemplate() as unknown as {
        mutationFn: (i: { id: string; name?: string }) => Promise<unknown>;
      };
      const result = await config.mutationFn({
        id: "t1",
        name: "Updated Template",
      });
      expect(result).toEqual(updated);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/widget-templates/t1",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated Template" }),
        },
      );
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Not found" }, 404),
      );
      const config = useUpdateWidgetTemplate() as unknown as {
        mutationFn: (i: { id: string }) => Promise<unknown>;
      };
      await expect(config.mutationFn({ id: "bad" })).rejects.toThrow(
        "Not found",
      );
    });
  });

  // ── useDeleteWidgetTemplate ─────────────────────────────────────────
  describe("useDeleteWidgetTemplate mutationFn", () => {
    it("DELETEs the widget template by id", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ success: true }),
      );
      const config = useDeleteWidgetTemplate() as unknown as {
        mutationFn: (id: string) => Promise<unknown>;
      };
      const result = await config.mutationFn("t5");
      expect(result).toEqual({ success: true });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/widget-templates/t5",
        { method: "DELETE" },
      );
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ error: "Forbidden" }, 403),
      );
      const config = useDeleteWidgetTemplate() as unknown as {
        mutationFn: (id: string) => Promise<unknown>;
      };
      await expect(config.mutationFn("t1")).rejects.toThrow("Forbidden");
    });
  });
});
