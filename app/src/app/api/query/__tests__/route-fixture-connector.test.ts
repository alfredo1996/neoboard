import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";
import {
  fixtureConnector,
  fixtureDescriptor,
  FIXTURE_ROWS,
} from "@/__tests__/fixtures/fixture-connector";

/**
 * #1948 (epic #1893, AC4): POST /api/query round-trips a query through a
 * connector that exists only in test code. The executor is NOT mocked — only
 * what every route test mocks: the session, the metadata database, the
 * config decryption, and the schema prefetch (not on the query path).
 */
const mockRequireSession = vi.fn();
const mockDb = { select: vi.fn(), insert: vi.fn(), update: vi.fn() };
const mockDecryptJson = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto/crypto", () => ({
  decryptJson: mockDecryptJson,
  encryptJson: vi.fn(),
}));
vi.mock("@/lib/connector/schema-prefetch", () => ({ prefetchSchema: vi.fn() }));
vi.mock("next/server", () => nextResponseMockFactory());

const TYPE = fixtureDescriptor.type;

/** The stored connection, as the metadata database hands it back. */
function selectReturns(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
    then: (resolve: (v: unknown[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  };
  return chain;
}

describe("POST /api/query through a connector defined only in test code (#1948)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request) => Promise<any>;
  let closeAllConnections: () => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // After resetModules, register with the registry the route will import.
    const connection = await import("@neoboard/connection");
    connection.registerConnector(fixtureConnector);
    ({ POST } = await import("../route"));
    ({ closeAllConnections } = await import("@/lib/query/query-executor"));

    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-a",
      role: "creator",
      canWrite: false,
    });
    mockDb.select.mockReturnValue(
      selectReturns([
        { id: "c1", type: TYPE, configEncrypted: "enc", userId: "user-1" },
      ]),
    );
    mockDecryptJson.mockReturnValue({
      endpoint: "acme://host/book",
      apiToken: "tok",
      maxRows: 2,
    });
  });

  afterEach(async () => {
    await closeAllConnections();
    const connection = await import("@neoboard/connection");
    connection.unregisterConnector(TYPE);
  });

  it("answers 200 with the connector's rows, capped at the connection's maxRows", async () => {
    const res = await POST(makeRequest({ connectionId: "c1", query: "ROWS" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ data: FIXTURE_ROWS.slice(0, 2) });
    expect(body.meta).toMatchObject({ rowLimit: 2, truncated: true });
  });

  it("fails as an unknown connector once the fixture is not registered", async () => {
    const connection = await import("@neoboard/connection");
    connection.unregisterConnector(TYPE);

    const res = await POST(makeRequest({ connectionId: "c1", query: "ROWS" }));

    expect(res.status).toBe(500);
    expect((await res.json()).error.message).toContain(
      `Unknown connector type: "${TYPE}"`,
    );
  });
});
