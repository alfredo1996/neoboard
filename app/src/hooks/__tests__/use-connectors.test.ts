import { describe, it, expect, vi, beforeEach } from "vitest";

// `useQuery` echoes its config back so a test can read what the hook built;
// the echo is reinstalled per test because a mockReturnValue outlives
// `clearAllMocks` (#1630).
const echoConfig = (config: Record<string, unknown>) => config;

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(echoConfig),
}));

const reactQuery = await import("@tanstack/react-query");
const { useConnectors, useConnector } = await import("../use-connectors");

const descriptors = [
  { type: "acme-sheets", label: "Acme Sheets", category: "file", fields: [] },
  { type: "acme-graph", label: "Acme Graph", category: "graph", fields: [] },
];

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(reactQuery.useQuery).mockReset();
  vi.mocked(reactQuery.useQuery).mockImplementation(echoConfig as never);
});

describe("useConnectors", () => {
  it("reads /api/connectors and unwraps the envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockResponse({ data: descriptors, error: null, meta: null }),
    );
    const config = useConnectors() as unknown as {
      queryFn: () => Promise<unknown>;
    };
    expect(await config.queryFn()).toEqual(descriptors);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/connectors");
  });

  it("never goes stale: what is installed cannot change under a running server", () => {
    const config = useConnectors() as unknown as {
      queryKey: unknown[];
      staleTime: number;
    };
    expect(config.queryKey).toEqual(["connectors"]);
    expect(config.staleTime).toBe(Infinity);
  });

  it("rejects on an error envelope, so the caller can offer a retry", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "boom" } },
        500,
      ),
    );
    const config = useConnectors() as unknown as {
      queryFn: () => Promise<unknown>;
    };
    await expect(config.queryFn()).rejects.toThrow(/Internal server error/);
  });
});

describe("useConnector", () => {
  const loaded = (data: unknown) =>
    vi
      .mocked(reactQuery.useQuery)
      .mockReturnValueOnce({ data } as ReturnType<typeof reactQuery.useQuery>);

  it("selects the descriptor of a type", () => {
    loaded(descriptors);
    expect(useConnector("acme-graph")).toBe(descriptors[1]);
  });

  it("is undefined for a type nobody registered", () => {
    loaded(descriptors);
    expect(useConnector("uninstalled")).toBeUndefined();
  });

  it("is undefined while loading, and for no type at all", () => {
    loaded(undefined);
    expect(useConnector("acme-graph")).toBeUndefined();
    loaded(descriptors);
    expect(useConnector(undefined)).toBeUndefined();
  });
});
