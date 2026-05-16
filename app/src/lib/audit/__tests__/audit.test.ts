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
