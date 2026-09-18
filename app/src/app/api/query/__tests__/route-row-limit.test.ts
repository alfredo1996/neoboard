/**
 * POST /api/query with the REAL query executor (#1896).
 *
 * route.test.ts mocks the executor, so it can only show the route handing the
 * requested `rowLimit` over. The clamp lives in `executeQuery`; this file runs
 * route and executor together and reads what reaches the connector.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

const mockRequireSession = vi.fn();
const mockDb = { select: vi.fn() };
const mockDecryptJson = vi.fn();
const mockRunQuery = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto/crypto", () => ({ decryptJson: mockDecryptJson }));
vi.mock("@/lib/connector/connection-adapter", () => ({
  createConnectionModule: () => ({ runQuery: mockRunQuery }),
  DEFAULT_CONNECTION_CONFIG: { connectionTimeout: 30000, timeout: 30000 },
  ConnectionTypes: { UNKNOWN: 0, NEO4J: 1, POSTGRESQL: 2 },
}));
vi.mock("next/server", () => nextResponseMockFactory());

const QUERY = "SELECT * FROM movies ORDER BY title;";

describe("POST /api/query — rowLimit reaches the connector clamped (#1896)", () => {
  let POST: (req: Request) => Promise<Response>;
  let sent: { params: unknown; config: { rowLimit?: number } };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-a",
      role: "creator",
      canWrite: true,
    });
    const rows = [{ id: "c1", type: "postgresql", configEncrypted: "enc" }];
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(rows),
    };
    mockDb.select.mockReturnValue(chain);
    mockRunQuery.mockImplementation(
      (
        params: unknown,
        cbs: { onSuccess: (v: unknown) => void },
        config: { rowLimit?: number },
      ) => {
        sent = { params, config };
        cbs.onSuccess([]);
      },
    );
    POST = (await import("../route")).POST;
  });

  function connectionMaxRows(maxRows?: number) {
    mockDecryptJson.mockReturnValue({
      uri: "postgres://db.example:5432/app",
      username: "u",
      password: "p",
      maxRows,
    });
  }

  it.each([
    { maxRows: 1000, requested: 25, effective: 25 },
    { maxRows: 1000, requested: 100_000, effective: 1000 },
    { maxRows: undefined, requested: 100_000, effective: 5000 },
    { maxRows: 1000, requested: undefined, effective: 1000 },
  ])(
    "maxRows $maxRows, requested $requested → the connector runs at $effective",
    async ({ maxRows, requested, effective }) => {
      connectionMaxRows(maxRows);

      const res = await POST(
        makeRequest({ connectionId: "c1", query: QUERY, rowLimit: requested }),
      );

      expect(res.status).toBe(200);
      expect(sent.config.rowLimit).toBe(effective);
      expect((await res.json()).meta.rowLimit).toBe(effective);
      // The cap is the driver's; the query text is the user's, untouched.
      expect(sent.params).toMatchObject({ query: QUERY });
    },
  );
});
