import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireUserId = vi.fn<() => Promise<string>>();
const mockTestConnection = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireUserId: mockRequireUserId }));
vi.mock("@/lib/query-executor", () => ({ testConnection: mockTestConnection }));
vi.mock("next/server", () => nextResponseMockFactory());

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

  it("returns 500 with 'Unauthorized' when unauthenticated", async () => {
    mockRequireUserId.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 for invalid body (missing type)", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const res = await POST(makeRequest({ config: { uri: "x", username: "u", password: "p" } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 for invalid type value", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const res = await POST(
      makeRequest({ type: "mysql", config: { uri: "x", username: "u", password: "p" } })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when config.uri is empty", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const res = await POST(
      makeRequest({ type: "neo4j", config: { uri: "", username: "u", password: "p" } })
    );
    expect(res.status).toBe(400);
  });

  it("returns success:true when test passes", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockTestConnection.mockResolvedValue(true);
    const res = await POST(
      makeRequest({
        type: "neo4j",
        config: { uri: "bolt://localhost:7687", username: "neo4j", password: "pass" },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("passes optional database to testConnection", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockTestConnection.mockResolvedValue(true);
    await POST(
      makeRequest({
        type: "postgresql",
        config: { uri: "pg://localhost", username: "pg", password: "pass", database: "mydb" },
      })
    );
    expect(mockTestConnection).toHaveBeenCalledWith("postgresql", {
      uri: "pg://localhost",
      username: "pg",
      password: "pass",
      database: "mydb",
    });
  });

  it("returns 500 when testConnection throws", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockTestConnection.mockRejectedValue(new Error("Refused"));
    const res = await POST(
      makeRequest({
        type: "neo4j",
        config: { uri: "bolt://localhost", username: "neo4j", password: "pass" },
      })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Refused");
  });
});
