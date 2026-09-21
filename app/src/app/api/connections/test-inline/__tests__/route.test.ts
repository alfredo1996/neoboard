import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";
import { raisedByConnector } from "@/__tests__/helpers/connector-errors";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{
    userId: string;
    role: string;
    canWrite: boolean;
    tenantId: string;
  }>
>();
const mockTestConnection = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/query/query-executor", () => ({
  testConnection: mockTestConnection,
}));
vi.mock("next/server", () => nextResponseMockFactory());
// Connector-type validation is registry-driven (#1121); stub it so the route
// tests don't load the driver-heavy connection registry.
vi.mock("@/lib/connector/registered-types", () => ({
  isRegisteredConnectorType: (t: string) => t === "neo4j" || t === "postgresql",
}));

const SESSION = {
  userId: "user-1",
  role: "creator",
  canWrite: true,
  tenantId: "t1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/connections/test-inline", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 for readers — inline test is an arbitrary host:port probe (#971)", async () => {
    mockRequireSession.mockResolvedValue({
      ...SESSION,
      role: "reader",
      canWrite: false,
    });
    const res = await POST(
      makeRequest({
        type: "postgresql",
        config: {
          uri: "postgresql://10.0.0.1:5432/db",
          username: "u",
          password: "p",
        },
      }),
    );
    expect(res.status).toBe(403);
    expect(mockTestConnection).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid body (missing type)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await POST(
      makeRequest({ config: { uri: "x", username: "u", password: "p" } }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid type value", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await POST(
      makeRequest({
        type: "mysql",
        config: { uri: "x", username: "u", password: "p" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when config.uri is empty", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await POST(
      makeRequest({
        type: "neo4j",
        config: { uri: "", username: "u", password: "p" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns success:true when test passes", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockTestConnection.mockResolvedValue(true);
    const res = await POST(
      makeRequest({
        type: "neo4j",
        config: {
          uri: "bolt://localhost:7687",
          username: "neo4j",
          password: "pass",
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(true);
  });

  it("passes optional database to testConnection", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockTestConnection.mockResolvedValue(true);
    await POST(
      makeRequest({
        type: "postgresql",
        config: {
          uri: "postgresql://localhost",
          username: "pg",
          password: "pass",
          database: "mydb",
        },
      }),
    );
    expect(mockTestConnection).toHaveBeenCalledWith(
      "postgresql",
      expect.objectContaining({
        uri: "postgresql://localhost",
        username: "pg",
        password: "pass",
        database: "mydb",
      }),
    );
  });

  it("passes the options the connector declares, and strips the ones it does not (#1901)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockTestConnection.mockResolvedValue(true);
    const declared = {
      uri: "bolt://localhost:7687",
      username: "neo4j",
      password: "pass",
      connectionTimeout: 5000,
      queryTimeout: 30000,
      maxPoolSize: 20,
      connectionAcquisitionTimeout: 10000,
    };
    await POST(
      makeRequest({
        type: "neo4j",
        config: {
          ...declared,
          // Another connector's options: this descriptor does not declare them.
          idleTimeout: 15000,
          statementTimeout: 60000,
          sslRejectUnauthorized: false,
        },
      }),
    );
    expect(mockTestConnection).toHaveBeenCalledExactlyOnceWith(
      "neo4j",
      declared,
    );
  });

  it("answers 400 per field for a value outside the descriptor's bounds, and never dials", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await POST(
      makeRequest({
        type: "neo4j",
        config: {
          uri: "bolt://localhost:7687",
          username: "neo4j",
          password: "pass",
          maxPoolSize: 101,
        },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.details.fields).toEqual({
      maxPoolSize: "Max Pool Size must be at most 100",
    });
    expect(mockTestConnection).not.toHaveBeenCalled();
  });

  it("returns success:false with actionable message + code when testConnection returns false (#1043)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockTestConnection.mockResolvedValue(false);
    const res = await POST(
      makeRequest({
        type: "postgresql",
        config: {
          uri: "postgresql://localhost",
          username: "pg",
          password: "pass",
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(false);
    expect(body.data.code).toBe("unknown");
    expect(body.data.error).not.toMatch(/check returned false/i);
    expect(body.data.error).toMatch(/verify the host, port, credentials/i);
  });

  it("returns success:false with fallback message for non-Error throws", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockTestConnection.mockRejectedValue("string error");
    const res = await POST(
      makeRequest({
        type: "neo4j",
        config: {
          uri: "bolt://localhost",
          username: "neo4j",
          password: "pass",
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(false);
    expect(body.data.error).toBe("Connection test failed");
    expect(body.data.code).toBe("unknown");
  });

  it("returns success:false with error message when testConnection throws", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockTestConnection.mockRejectedValue(new Error("Refused"));
    const res = await POST(
      makeRequest({
        type: "neo4j",
        config: {
          uri: "bolt://localhost",
          username: "neo4j",
          password: "pass",
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(false);
    expect(body.data.error).toBe("Refused");
    expect(body.data.code).toBe("unknown");
  });

  it("classifies auth failures with code:auth_failed", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockTestConnection.mockRejectedValue(raisedByConnector("AUTHENTICATION"));
    const res = await POST(
      makeRequest({
        type: "neo4j",
        config: {
          uri: "bolt://localhost",
          username: "neo4j",
          password: "wrong",
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(false);
    expect(body.data.code).toBe("auth_failed");
  });

  it("classifies network failures with code:network", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockTestConnection.mockRejectedValue(raisedByConnector("NETWORK"));
    const res = await POST(
      makeRequest({
        type: "neo4j",
        config: {
          uri: "bolt://localhost:7687",
          username: "neo4j",
          password: "pass",
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(false);
    expect(body.data.code).toBe("network");
  });

  it("answers 400 for a URI scheme the connector does not accept — it never reaches the driver (#1901)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await POST(
      makeRequest({
        type: "neo4j",
        config: { uri: "http://oops", username: "u", password: "p" },
      }),
    );
    expect(res.status).toBe(400);
    expect(mockTestConnection).not.toHaveBeenCalled();
  });

  it("classifies a URI the driver itself rejects with code:bad_uri", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockTestConnection.mockRejectedValue(raisedByConnector("BAD_URI"));
    const res = await POST(
      makeRequest({
        type: "neo4j",
        config: { uri: "bolt://oops", username: "u", password: "p" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(false);
    expect(body.data.code).toBe("bad_uri");
  });
});
