import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    insert: mockInsert,
  },
}));
vi.mock("@/lib/db/schema", () => ({
  auditLogs: "audit_log_table",
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe("auditLog", () => {
  let auditLog: typeof import("@/lib/audit/audit").auditLog;
  let auditRequest: typeof import("@/lib/audit/audit").auditRequest;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/db", () => ({
      db: { insert: mockInsert },
    }));
    vi.doMock("@/lib/db/schema", () => ({
      auditLogs: "audit_log_table",
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    const valuesReturn = {
      catch: vi.fn().mockReturnValue(Promise.resolve()),
    };
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue(valuesReturn),
    });

    const mod = await import("@/lib/audit/audit");
    auditLog = mod.auditLog;
    auditRequest = mod.auditRequest;
  });

  it("inserts an audit log entry", () => {
    auditLog({
      tenantId: "tenant-a",
      userId: "user-1",
      action: "dashboard.create",
      resourceType: "dashboard",
      resourceId: "dash-1",
    });

    expect(mockInsert).toHaveBeenCalledWith("audit_log_table");
    const values = mockInsert.mock.results[0].value.values;
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        userId: "user-1",
        action: "dashboard.create",
        resourceType: "dashboard",
        resourceId: "dash-1",
      }),
    );
  });

  it("handles missing userId gracefully", () => {
    auditLog({
      tenantId: "tenant-a",
      action: "auth.login.failed",
    });

    const values = mockInsert.mock.results[0].value.values;
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        action: "auth.login.failed",
      }),
    );
  });

  it("does not throw when db insert fails", async () => {
    const catchFn = vi.fn();
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({ catch: catchFn }),
    });

    expect(() => {
      auditLog({
        tenantId: "tenant-a",
        userId: "user-1",
        action: "connection.create",
      });
    }).not.toThrow();
  });

  it("does not throw when the db client throws synchronously", () => {
    // The fire-and-forget contract has to hold for sync throws too — a pool
    // exhaustion or a driver-level error must never fail the caller's request.
    mockInsert.mockImplementation(() => {
      throw new Error("pool exhausted");
    });

    expect(() =>
      auditLog({
        tenantId: "tenant-a",
        userId: "user-1",
        action: "connection.create",
      }),
    ).not.toThrow();
  });

  it("does not throw when the insert builder returns a non-thenable", () => {
    mockInsert.mockReturnValue({ values: vi.fn().mockReturnValue(undefined) });

    expect(() =>
      auditLog({
        tenantId: "tenant-a",
        userId: "user-1",
        action: "key.create",
      }),
    ).not.toThrow();
  });

  describe("auditRequest", () => {
    const makeReq = (headers: Record<string, string> = {}) =>
      new Request("https://example.test/api/connections", { headers });

    it("stamps the client IP from the first x-forwarded-for hop", () => {
      auditRequest(makeReq({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }), {
        tenantId: "tenant-a",
        userId: "user-1",
        action: "connection.create",
        resourceType: "connection",
        resourceId: "conn-1",
      });

      const values = mockInsert.mock.results[0].value.values;
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "connection.create",
          resourceId: "conn-1",
          ipAddress: "9.9.9.9",
        }),
      );
    });

    it("falls back to unknown when the header is absent", () => {
      auditRequest(makeReq(), {
        tenantId: "tenant-a",
        userId: "user-1",
        action: "key.revoke",
      });

      const values = mockInsert.mock.results[0].value.values;
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: "unknown" }),
      );
    });

    it("does not throw when the db insert fails", () => {
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({ catch: vi.fn() }),
      });

      expect(() =>
        auditRequest(makeReq(), {
          tenantId: "tenant-a",
          userId: "user-1",
          action: "connection.delete",
        }),
      ).not.toThrow();
    });

    it("does not throw when the request has no headers", () => {
      // Audit must never be the reason a request fails, including when handed
      // a request-like object (test doubles, future edge runtimes).
      expect(() =>
        auditRequest({} as unknown as Request, {
          tenantId: "tenant-a",
          userId: "user-1",
          action: "connection.delete",
        }),
      ).not.toThrow();

      const values = mockInsert.mock.results[0].value.values;
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: "unknown" }),
      );
    });
  });

  it("includes optional details and ipAddress", () => {
    auditLog({
      tenantId: "tenant-a",
      userId: "user-1",
      action: "query.execute",
      details: { connectorType: "postgresql", durationMs: 42 },
      ipAddress: "192.168.1.1",
    });

    const values = mockInsert.mock.results[0].value.values;
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        details: { connectorType: "postgresql", durationMs: 42 },
        ipAddress: "192.168.1.1",
      }),
    );
  });
});
