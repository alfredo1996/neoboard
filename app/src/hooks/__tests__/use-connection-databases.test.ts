import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock React Query — we're testing the config passed to useQuery, not React wiring
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((config: Record<string, unknown>) => config),
}));

// Import after mocks are set up
const { useConnectionDatabases } = await import("../use-connection-databases");

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

describe("useConnectionDatabases", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the correct query key with connectionId", () => {
    const config = useConnectionDatabases("conn-1") as unknown as {
      queryKey: unknown[];
      enabled: boolean;
    };
    expect(config.queryKey).toEqual(["connection-databases", "conn-1"]);
  });

  it("is enabled when connectionId is provided", () => {
    const config = useConnectionDatabases("conn-1") as unknown as {
      enabled: boolean;
    };
    expect(config.enabled).toBe(true);
  });

  it("is disabled when connectionId is undefined", () => {
    const config = useConnectionDatabases(undefined) as unknown as {
      enabled: boolean;
    };
    expect(config.enabled).toBe(false);
  });

  it("is disabled when connectionId is empty string", () => {
    const config = useConnectionDatabases("") as unknown as {
      enabled: boolean;
    };
    expect(config.enabled).toBe(false);
  });

  it("is disabled when enabled parameter is false", () => {
    const config = useConnectionDatabases("conn-1", false) as unknown as {
      enabled: boolean;
    };
    expect(config.enabled).toBe(false);
  });

  it("sets staleTime to 60 seconds", () => {
    const config = useConnectionDatabases("conn-1") as unknown as {
      staleTime: number;
    };
    expect(config.staleTime).toBe(60_000);
  });

  it("queryFn fetches from the correct API endpoint", async () => {
    const databases = { databases: ["neo4j", "system"] };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockResponse(databases),
    );

    const config = useConnectionDatabases("conn-42") as unknown as {
      queryFn: () => Promise<unknown>;
    };
    const result = await config.queryFn();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/connections/conn-42/databases",
    );
    expect(result).toEqual(databases);
  });

  it("queryFn unwraps envelope responses", async () => {
    const databases = { databases: ["mydb"] };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockResponse({ data: databases, error: null, meta: null }),
    );

    const config = useConnectionDatabases("conn-1") as unknown as {
      queryFn: () => Promise<unknown>;
    };
    const result = await config.queryFn();

    expect(result).toEqual(databases);
  });
});
