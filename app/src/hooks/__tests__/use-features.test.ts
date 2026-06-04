import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock React Query — we test the fetch logic, not React wiring
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((config: Record<string, unknown>) => config),
}));

const { useFeatures, useFeature } = await import("../use-features");

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("useFeatures", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /api/features and unwraps the envelope", async () => {
    const payload = {
      edition: "enterprise",
      features: ["sso", "custom-roles"],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockResponse({ data: payload, error: null, meta: null }),
    );
    const config = useFeatures() as unknown as {
      queryFn: () => Promise<unknown>;
      queryKey: unknown[];
      staleTime: number;
    };
    const result = await config.queryFn();
    expect(result).toEqual(payload);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/features");
  });

  it("uses queryKey ['features'] and 5-minute staleTime", () => {
    const config = useFeatures() as unknown as {
      queryKey: unknown[];
      staleTime: number;
    };
    expect(config.queryKey).toEqual(["features"]);
    expect(config.staleTime).toBe(5 * 60 * 1000);
  });
});

describe("useFeature", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined while features are loading", async () => {
    const reactQuery = await import("@tanstack/react-query");
    vi.mocked(reactQuery.useQuery).mockReturnValueOnce({
      data: undefined,
    } as ReturnType<typeof reactQuery.useQuery>);
    expect(useFeature("sso")).toBeUndefined();
  });

  it("returns true when the feature is in the list", async () => {
    const reactQuery = await import("@tanstack/react-query");
    vi.mocked(reactQuery.useQuery).mockReturnValueOnce({
      data: { edition: "enterprise", features: ["sso", "user-groups"] },
    } as ReturnType<typeof reactQuery.useQuery>);
    expect(useFeature("sso")).toBe(true);
  });

  it("returns false when the feature is not in the list", async () => {
    const reactQuery = await import("@tanstack/react-query");
    vi.mocked(reactQuery.useQuery).mockReturnValueOnce({
      data: { edition: "community", features: [] },
    } as ReturnType<typeof reactQuery.useQuery>);
    expect(useFeature("sso")).toBe(false);
  });

  it("returns false on community edition for every gated feature", async () => {
    const reactQuery = await import("@tanstack/react-query");
    vi.mocked(reactQuery.useQuery).mockReturnValue({
      data: { edition: "community", features: [] },
    } as ReturnType<typeof reactQuery.useQuery>);
    expect(useFeature("sso")).toBe(false);
    expect(useFeature("custom-roles")).toBe(false);
    expect(useFeature("bulk-import")).toBe(false);
  });
});
