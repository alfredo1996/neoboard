import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock React and React Query
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useMemo: vi.fn((fn: () => unknown) => fn()) };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((config: Record<string, unknown>) => ({
    data: (config as Record<string, unknown>).__testData ?? undefined,
    isLoading: false,
    ...config,
  })),
}));

vi.mock("@/lib/api-client", () => ({
  unwrapFullResponse: vi.fn(async (res: Response) => {
    const body = await res.json();
    if (!res.ok) throw new Error("Request failed");
    return {
      data: body?.data !== undefined ? body.data : body,
      meta: body?.meta ?? null,
    };
  }),
}));

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("useSeedQuery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("option mapping logic", () => {
    it("maps rows with named value/label columns", async () => {
      const { useQuery } = await import("@tanstack/react-query");
      vi.mocked(useQuery).mockReturnValue({
        data: {
          data: [
            { value: "id1", label: "Alice" },
            { value: "id2", label: "Bob" },
          ],
        },
        isLoading: false,
      } as ReturnType<typeof useQuery>);

      const { useSeedQuery } = await import("../use-seed-query");
      const { options } = useSeedQuery(
        "conn-1",
        "MATCH (n) RETURN n.id AS value, n.name AS label",
        true,
      );

      expect(options).toEqual([
        { value: "id1", label: "Alice", rawValue: "id1" },
        { value: "id2", label: "Bob", rawValue: "id2" },
      ]);
    });

    it("falls back to ordinal positions when value/label columns not present", async () => {
      const { useQuery } = await import("@tanstack/react-query");
      vi.mocked(useQuery).mockReturnValue({
        data: {
          data: [{ id: 42, name: "Carol" }],
        },
        isLoading: false,
      } as ReturnType<typeof useQuery>);

      const { useSeedQuery } = await import("../use-seed-query");
      const { options } = useSeedQuery("conn-1", "RETURN 1", true);

      expect(options).toEqual([{ value: "42", label: "Carol", rawValue: 42 }]);
    });

    it("handles primitive rows (non-object)", async () => {
      const { useQuery } = await import("@tanstack/react-query");
      vi.mocked(useQuery).mockReturnValue({
        data: { data: ["alpha", "beta"] },
        isLoading: false,
      } as ReturnType<typeof useQuery>);

      const { useSeedQuery } = await import("../use-seed-query");
      const { options } = useSeedQuery("conn-1", "RETURN 1", true);

      expect(options).toEqual([
        { value: "alpha", label: "alpha", rawValue: "alpha" },
        { value: "beta", label: "beta", rawValue: "beta" },
      ]);
    });

    it("returns empty options when data is null", async () => {
      const { useQuery } = await import("@tanstack/react-query");
      vi.mocked(useQuery).mockReturnValue({
        data: null,
        isLoading: false,
      } as ReturnType<typeof useQuery>);

      const { useSeedQuery } = await import("../use-seed-query");
      const { options } = useSeedQuery("conn-1", "RETURN 1", true);

      expect(options).toEqual([]);
    });

    it("returns empty options when data.data is not an array", async () => {
      const { useQuery } = await import("@tanstack/react-query");
      vi.mocked(useQuery).mockReturnValue({
        data: { data: "not-an-array" },
        isLoading: false,
      } as ReturnType<typeof useQuery>);

      const { useSeedQuery } = await import("../use-seed-query");
      const { options } = useSeedQuery("conn-1", "RETURN 1", true);

      expect(options).toEqual([]);
    });
  });

  describe("query configuration", () => {
    it("passes correct queryKey including all params", async () => {
      const { useQuery } = await import("@tanstack/react-query");
      vi.mocked(useQuery).mockReturnValue({
        data: null,
        isLoading: false,
      } as ReturnType<typeof useQuery>);

      const { useSeedQuery } = await import("../use-seed-query");
      useSeedQuery(
        "conn-1",
        "MATCH (n) RETURN n",
        true,
        { x: 1 },
        "tenant-abc",
      );

      expect(useQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: [
            "param-seed",
            "conn-1",
            "MATCH (n) RETURN n",
            { x: 1 },
            "tenant-abc",
          ],
          enabled: true,
          staleTime: 30_000,
          retry: false,
        }),
      );
    });

    it("disables query when connectionId is undefined", async () => {
      const { useQuery } = await import("@tanstack/react-query");
      vi.mocked(useQuery).mockReturnValue({
        data: null,
        isLoading: false,
      } as ReturnType<typeof useQuery>);

      const { useSeedQuery } = await import("../use-seed-query");
      useSeedQuery(undefined, "RETURN 1", true);

      expect(useQuery).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );
    });

    it("disables query when query string is undefined", async () => {
      const { useQuery } = await import("@tanstack/react-query");
      vi.mocked(useQuery).mockReturnValue({
        data: null,
        isLoading: false,
      } as ReturnType<typeof useQuery>);

      const { useSeedQuery } = await import("../use-seed-query");
      useSeedQuery("conn-1", undefined, true);

      expect(useQuery).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );
    });
  });

  describe("queryFn", () => {
    it("POSTs to /api/query with correct body", async () => {
      const { useQuery } = await import("@tanstack/react-query");
      let capturedQueryFn:
        | ((ctx: { signal: AbortSignal }) => Promise<unknown>)
        | undefined;
      vi.mocked(useQuery).mockImplementation(
        (config: Record<string, unknown>) => {
          capturedQueryFn = config.queryFn as typeof capturedQueryFn;
          return { data: null, isLoading: false } as ReturnType<
            typeof useQuery
          >;
        },
      );

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse({ data: { data: [] }, error: null, meta: null }),
      );

      const { useSeedQuery } = await import("../use-seed-query");
      useSeedQuery("conn-1", "RETURN 1", true, { foo: "bar" }, "tenant-1");

      expect(capturedQueryFn).toBeDefined();
      await capturedQueryFn!({ signal: new AbortController().signal });

      expect(globalThis.fetch).toHaveBeenCalledWith("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: expect.any(AbortSignal),
        body: JSON.stringify({
          connectionId: "conn-1",
          query: "RETURN 1",
          params: { foo: "bar" },
          tenantId: "tenant-1",
        }),
      });
    });
  });
});
