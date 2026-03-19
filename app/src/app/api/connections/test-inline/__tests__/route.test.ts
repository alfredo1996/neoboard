import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{ userId: string; role: string; canWrite: boolean; tenantId: string }>
>();
const mockTestConnection = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/query-executor", () => ({ testConnection: mockTestConnection }));
vi.mock("next/server", () => nextResponseMockFactory());

const SESSION = { userId: "user-1", role: "creator", canWrite: true, tenantId: "t1" };

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

  it("returns 400 for invalid body (missing type)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await POST(makeRequest({ config: { uri: "x", username: "u", password: "p" } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid type value", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await POST(
      makeRequest({ type: "mysql", config: { uri: "x", username: "u", password: "p" } }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when config.uri is empty", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await POST(
      makeRequest({ type: "neo4j", config: { uri: "", username: "u", password: "p" } }),
    );
    expect(res.status).toBe(400);
  });

  it("returns success:true when test passes", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockTestConnection.mockResolvedValue(true);
    const res = await POST(
      makeRequest({
        type: "neo4j",
        config: { uri: "bolt://localhost:7687", username: "neo4j", password: "pass" },
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
        config: { uri: "pg://localhost", username: "pg", password: "pass", database: "mydb" },
      }),
    );
    expect(mockTestConnection).toHaveBeenCalledWith(
      "postgresql",
      expect.objectContaining({
        uri: "pg://localhost",
        username: "pg",
        password: "pass",
        database: "mydb",
      }),
    );
  });

  it("passes advanced pool settings to testConnection", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockTestConnection.mockResolvedValue(true);
    await POST(
      makeRequest({
        type: "neo4j",
        config: {
          uri: "bolt://localhost:7687",
          username: "neo4j",
          password: "pass",
          connectionTimeout: 5000,
          queryTimeout: 30000,
          maxPoolSize: 20,
          connectionAcquisitionTimeout: 10000,
          idleTimeout: 15000,
          statementTimeout: 60000,
          sslRejectUnauthorized: false,
        },
      }),
    );
    expect(mockTestConnection).toHaveBeenCalledWith(
      "neo4j",
      expect.objectContaining({
        uri: "bolt://localhost:7687",
        username: "neo4j",
        password: "pass",
        connectionTimeout: 5000,
        queryTimeout: 30000,
        maxPoolSize: 20,
        connectionAcquisitionTimeout: 10000,
        idleTimeout: 15000,
        statementTimeout: 60000,
        sslRejectUnauthorized: false,
      }),
    );
  });

  it("returns success:false when testConnection returns false", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockTestConnection.mockResolvedValue(false);
    const res = await POST(
      makeRequest({
        type: "postgresql",
        config: { uri: "pg://localhost", username: "pg", password: "pass" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(false);
  });

  it("returns 500 with fallback message for non-Error throws", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockTestConnection.mockRejectedValue("string error");
    const res = await POST(
      makeRequest({
        type: "neo4j",
        config: { uri: "bolt://localhost", username: "neo4j", password: "pass" },
      }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBe("Connection test failed");
  });

  it("returns 500 when testConnection throws", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockTestConnection.mockRejectedValue(new Error("Refused"));
    const res = await POST(
      makeRequest({
        type: "neo4j",
        config: { uri: "bolt://localhost", username: "neo4j", password: "pass" },
      }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
