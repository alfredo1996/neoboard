import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { registerConnector, unregisterConnector } from "@neoboard/connection";
import {
  makeSelectChain,
  makeInsertChain,
  makeUpdateChain,
  resetDbMock,
  sqlColumns,
  sqlValues,
} from "@/__tests__/helpers/drizzle-mocks";
import { makeRequest, makeParams } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";
import {
  fixtureConnector,
  FIXTURE_SECRETS,
} from "@/__tests__/fixtures/fixture-connector";

/**
 * The connections routes, driven by a connector nothing in `app/` knows
 * (#1901). The REAL registry runs here with the fixture registered in it: the
 * point is that validation, stripping, redaction and "blank keeps the stored
 * secret" all follow whatever descriptor is registered — including one with
 * TWO secrets, neither of them keyed `password`.
 */

const mockRequireSession = vi.fn();
const mockEncryptJson = vi.fn((v: unknown) => `enc:${JSON.stringify(v)}`);
const mockDecryptJson = vi.fn();
const mockPrefetchSchema = vi.fn();
const mockTestConnection = vi.fn();
const mockListDatabases = vi.fn();
const mockDb = { select: vi.fn(), insert: vi.fn(), update: vi.fn() };

/** Every logger and console call lands here, so a leak has nowhere to hide. */
const logged: unknown[][] = [];
const record = (...args: unknown[]) => void logged.push(args);
const fakeLogger: Record<string, unknown> = {
  error: record,
  warn: record,
  info: record,
  debug: record,
  trace: record,
  fatal: record,
  child: () => fakeLogger,
};

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/audit/audit", () => ({
  auditRequest: record,
  auditLog: record,
}));
vi.mock("@/lib/crypto/crypto", () => ({
  encryptJson: mockEncryptJson,
  decryptJson: mockDecryptJson,
}));
vi.mock("@/lib/connector/schema-prefetch", () => ({
  prefetchSchema: mockPrefetchSchema,
}));
vi.mock("@/lib/query/query-executor", () => ({
  closeConnection: vi.fn(),
  testConnection: mockTestConnection,
  listDatabases: mockListDatabases,
  listSchemas: vi.fn(async () => []),
}));
vi.mock("@/lib/query/middleware/dead-connector", () => ({
  forgetDeadConnector: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: fakeLogger,
  apiLogger: fakeLogger,
  queryLogger: fakeLogger,
  authLogger: fakeLogger,
}));
vi.mock("next/server", () => nextResponseMockFactory());

const { POST } = await import("../route");
const { GET, PATCH } = await import("../[id]/route");
const { POST: TEST_INLINE } = await import("../test-inline/route");
const { POST: LIST_DATABASES_INLINE } =
  await import("../list-databases-inline/route");

const TYPE = fixtureConnector.type;
const SESSION = {
  userId: "user-1",
  role: "creator",
  canWrite: true,
  tenantId: "t1",
};
const STORED = {
  endpoint: "acme://host/book",
  region: "eu",
  pageSize: 50,
  maxRows: 2000,
  ...FIXTURE_SECRETS,
};
const ROW = {
  id: "c1",
  name: "Books",
  type: TYPE,
  configEncrypted: "enc:stored",
  visibility: "private",
  ownerId: "user-1",
};

/** Nothing that left the server or reached a log may hold a secret's value. */
function expectNoSecretIn(...haystacks: unknown[]) {
  const text = JSON.stringify([...haystacks, logged], (_key, value) =>
    value instanceof Error ? `${value.message}\n${value.stack}` : value,
  );
  for (const secret of Object.values(FIXTURE_SECRETS)) {
    expect(text).not.toContain(secret);
  }
}

registerConnector(fixtureConnector);
afterAll(() => unregisterConnector(TYPE));

beforeEach(() => {
  vi.clearAllMocks();
  resetDbMock(mockDb);
  logged.length = 0;
  mockRequireSession.mockResolvedValue(SESSION);
  mockDecryptJson.mockReturnValue(STORED);
  vi.spyOn(console, "error").mockImplementation(record);
  vi.spyOn(console, "warn").mockImplementation(record);
  vi.spyOn(console, "log").mockImplementation(record);
});

describe("POST /api/connections — validated by the connector's descriptor", () => {
  it("stores the declared values and maxRows, and strips every other key before encryption", async () => {
    mockDb.insert.mockReturnValue(makeInsertChain([{ id: "c1", type: TYPE }]));

    const res = await POST(
      makeRequest({
        name: "Books",
        type: TYPE,
        config: {
          endpoint: "acme://host/book",
          ...FIXTURE_SECRETS,
          pageSize: 50,
          maxRows: 2000,
          // Another connector's option, and keys nobody declares.
          maxPoolSize: 10,
          username: "root",
        },
      }),
    );

    expect(res.status).toBe(201);
    const expected = {
      endpoint: "acme://host/book",
      ...FIXTURE_SECRETS,
      pageSize: 50,
      maxRows: 2000,
    };
    expect(mockEncryptJson).toHaveBeenCalledExactlyOnceWith(expected);
    expect(mockPrefetchSchema).toHaveBeenCalledWith(TYPE, expected);
  });

  it("answers 400 with a message per field and echoes no value", async () => {
    const res = await POST(
      makeRequest({
        name: "Books",
        type: TYPE,
        config: {
          endpoint: `acme://user:${FIXTURE_SECRETS.apiToken}@host/book`,
          apiToken: FIXTURE_SECRETS.apiToken,
          signingSecret: [FIXTURE_SECRETS.signingSecret],
          region: "mars",
          pageSize: 9000,
        },
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.fields).toEqual({
      endpoint: "Do not put a password in the URI — use the password field.",
      signingSecret: "Signing Secret must be text",
      region: "Region must be one of: eu, us",
      pageSize: "Page Size must be at most 500",
    });
    expect(mockEncryptJson).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
    expectNoSecretIn(body);
  });

  it("requires what the descriptor requires — not a fixed uri/username/password", async () => {
    const res = await POST(
      makeRequest({ name: "Books", type: TYPE, config: { region: "eu" } }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.details.fields).toEqual({
      endpoint: "Endpoint is required",
      apiToken: "API Token is required",
    });
  });

  it("still validates maxRows itself", async () => {
    const res = await POST(
      makeRequest({
        name: "Books",
        type: TYPE,
        config: { endpoint: "acme://host/book", apiToken: "t", maxRows: 5 },
      }),
    );
    expect(res.status).toBe(400);
    expect(mockEncryptJson).not.toHaveBeenCalled();
  });

  it("answers 400 for a type that is not registered", async () => {
    const res = await POST(
      makeRequest({
        name: "Books",
        type: "nobody-installed-this",
        config: { endpoint: "acme://host/book", apiToken: "t" },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("Unknown connector type");
    expect(mockEncryptJson).not.toHaveBeenCalled();
  });
});

describe("GET /api/connections/[id] — every secret redacted", () => {
  it("returns the declared non-secret values and maxRows; BOTH secrets stay on the server", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([ROW]));

    const res = await GET(makeRequest({}), makeParams("c1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.config).toEqual({
      endpoint: "acme://host/book",
      region: "eu",
      pageSize: 50,
      maxRows: 2000,
    });
    expectNoSecretIn(body);
  });

  it("returns no config at all once the connector is uninstalled", async () => {
    mockDb.select.mockReturnValue(
      makeSelectChain([{ ...ROW, type: "nobody-installed-this" }]),
    );
    const body = await (await GET(makeRequest({}), makeParams("c1"))).json();
    expect(body.data.config).toBeUndefined();
    expectNoSecretIn(body);
  });
});

describe("PATCH /api/connections/[id] — blank keeps the stored secret", () => {
  const stubRow = () => {
    const selectChain = makeSelectChain([
      { configEncrypted: "enc:stored", type: TYPE },
    ]);
    mockDb.select.mockReturnValue(selectChain);
    mockDb.update.mockReturnValue(makeUpdateChain([{ id: "c1", type: TYPE }]));
    return selectChain;
  };

  it("keeps BOTH stored secrets when both are blank or left out, scoped to owner and tenant", async () => {
    const selectChain = stubRow();

    const res = await PATCH(
      makeRequest({
        config: { endpoint: "acme://new/book", apiToken: "", pageSize: 10 },
      }),
      makeParams("c1"),
    );

    expect(res.status).toBe(200);
    expect(mockEncryptJson).toHaveBeenCalledExactlyOnceWith({
      endpoint: "acme://new/book",
      pageSize: 10,
      ...FIXTURE_SECRETS,
    });
    // The read that feeds the secret merge is scoped to id + owner + session
    // tenant: anything wider would copy another tenant's secrets (#1607).
    const [expr] = selectChain.calls.where[0];
    expect(sqlColumns(expr)).toEqual(
      expect.arrayContaining(["id", "userId", "tenant_id"]),
    );
    expect(sqlValues(expr)).toEqual(
      expect.arrayContaining(["c1", "user-1", "t1"]),
    );
    expectNoSecretIn(await res.json());
  });

  it("replaces the one secret that was provided and keeps the other", async () => {
    stubRow();

    await PATCH(
      makeRequest({
        config: { endpoint: "acme://host/book", signingSecret: "rotated" },
      }),
      makeParams("c1"),
    );

    expect(mockEncryptJson).toHaveBeenCalledExactlyOnceWith({
      endpoint: "acme://host/book",
      apiToken: FIXTURE_SECRETS.apiToken,
      signingSecret: "rotated",
    });
  });

  it("drops a stored key the descriptor does not declare, and any the request adds", async () => {
    stubRow();
    mockDecryptJson.mockReturnValue({ ...STORED, legacyOption: 1 });

    await PATCH(
      makeRequest({
        config: { endpoint: "acme://host/book", maxPoolSize: 10 },
      }),
      makeParams("c1"),
    );

    expect(mockEncryptJson).toHaveBeenCalledExactlyOnceWith({
      endpoint: "acme://host/book",
      ...FIXTURE_SECRETS,
    });
  });

  it("answers 400 per field without echoing a stored or a submitted value", async () => {
    stubRow();

    const res = await PATCH(
      makeRequest({
        config: { endpoint: "https://host/book", pageSize: 0 },
      }),
      makeParams("c1"),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(Object.keys(body.error.details.fields)).toEqual([
      "endpoint",
      "pageSize",
    ]);
    expect(mockEncryptJson).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expectNoSecretIn(body);
  });

  it("with an unreadable stored config, saves once every required secret is re-entered", async () => {
    stubRow();
    mockDecryptJson.mockImplementation(() => {
      throw new Error("bad cipher");
    });

    const blank = await PATCH(
      makeRequest({ config: { endpoint: "acme://host/book" } }),
      makeParams("c1"),
    );
    expect(blank.status).toBe(400);
    expect((await blank.json()).error.message).toMatch(
      /could not be decrypted/,
    );
    expect(mockEncryptJson).not.toHaveBeenCalled();

    const reentered = await PATCH(
      makeRequest({
        config: { endpoint: "acme://host/book", apiToken: "fresh" },
      }),
      makeParams("c1"),
    );
    expect(reentered.status).toBe(200);
    expect(mockEncryptJson).toHaveBeenCalledExactlyOnceWith({
      endpoint: "acme://host/book",
      apiToken: "fresh",
    });
  });

  it("answers 404 for a connection the caller does not own, before validating anything", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await PATCH(
      makeRequest({ config: { endpoint: "nonsense" } }),
      makeParams("c1"),
    );
    expect(res.status).toBe(404);
    expect(mockEncryptJson).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("logs no decrypted value when the save itself fails", async () => {
    stubRow();
    mockDb.update.mockImplementation(() => {
      throw new Error("db down");
    });

    const res = await PATCH(
      makeRequest({ config: { endpoint: "acme://host/book" } }),
      makeParams("c1"),
    );

    expect(res.status).toBe(500);
    expect(logged.length).toBeGreaterThan(0);
    expectNoSecretIn(await res.json());
  });
});

describe("inline routes — the same descriptor check, nothing stored", () => {
  it("test-inline hands the connector its declared values only", async () => {
    mockTestConnection.mockResolvedValue(true);

    const res = await TEST_INLINE(
      makeRequest({
        type: TYPE,
        config: {
          endpoint: "acme://host/book",
          apiToken: "t",
          maxRows: 2000,
          maxPoolSize: 10,
        },
      }),
    );

    expect((await res.json()).data).toEqual({ success: true });
    expect(mockTestConnection).toHaveBeenCalledExactlyOnceWith(TYPE, {
      endpoint: "acme://host/book",
      apiToken: "t",
      maxRows: 2000,
    });
  });

  it("test-inline answers 400 per field and never dials", async () => {
    const res = await TEST_INLINE(
      makeRequest({
        type: TYPE,
        config: { ...FIXTURE_SECRETS, pageSize: 9000 },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.details.fields).toEqual({
      endpoint: "Endpoint is required",
      pageSize: "Page Size must be at most 500",
    });
    expect(mockTestConnection).not.toHaveBeenCalled();
    expectNoSecretIn(body);
  });

  it("list-databases-inline validates the same way", async () => {
    const bad = await LIST_DATABASES_INLINE(
      makeRequest({ type: TYPE, config: { apiToken: "t" } }),
    );
    expect(bad.status).toBe(400);
    expect(mockListDatabases).not.toHaveBeenCalled();

    mockListDatabases.mockResolvedValue(["books"]);
    const ok = await LIST_DATABASES_INLINE(
      makeRequest({
        type: TYPE,
        config: { endpoint: "acme://host/book", apiToken: "t", extra: 1 },
      }),
    );
    expect((await ok.json()).data).toEqual({
      databases: ["books"],
      // #1902 asks every connector for schemas rather than gating on a type,
      // so the key is always present — empty for a connector without them.
      schemas: [],
    });
    expect(mockListDatabases).toHaveBeenCalledExactlyOnceWith(TYPE, {
      endpoint: "acme://host/book",
      apiToken: "t",
    });
  });
});
