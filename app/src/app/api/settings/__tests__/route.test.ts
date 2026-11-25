import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { applySettingRows, SettingsValidationError } from "@/lib/settings/core";

const mockRequireAdmin =
  vi.fn<() => Promise<{ userId: string; tenantId: string }>>();
const mockSave = vi.fn();
const mockRefresh = vi.fn();
const mockAudit = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/settings/store", () => ({
  saveSettings: mockSave,
  refreshSettings: mockRefresh,
}));
vi.mock("@/lib/audit/audit", () => ({ auditRequest: mockAudit }));
vi.mock("next/server", () => nextResponseMockFactory());

const { GET, PUT } = await import("../route");

const put = (body: unknown) =>
  PUT(makeRequest(body, "http://localhost/api/settings"));

beforeEach(() => {
  vi.clearAllMocks();
  applySettingRows([]);
  process.env.TENANT_ID = "t-1";
  mockRequireAdmin.mockResolvedValue({ userId: "admin-1", tenantId: "t-1" });
  mockSave.mockResolvedValue([]);
});
afterEach(() => {
  delete process.env.SETTINGS_LOCKED;
  delete process.env.TENANT_ID;
  delete process.env.SESSION_MAX_AGE;
});

describe("admin only", () => {
  it.each([
    ["GET", () => GET()],
    ["PUT", () => put({ changes: { LOG_LEVEL: "debug" } })],
  ])("%s answers 403 to a creator or a reader", async (_m, call) => {
    mockRequireAdmin.mockRejectedValue(new ForbiddenError());
    const res = await call();
    expect(res.status).toBe(403);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("answers 401 without a session", async () => {
    mockRequireAdmin.mockRejectedValue(new UnauthorizedError());
    expect((await GET()).status).toBe(401);
  });
});

describe("GET /api/settings", () => {
  it("returns every key with its source, and the read-only session length", async () => {
    process.env.SESSION_MAX_AGE = "3600";
    const res = await GET();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.settings.QUERY_MAX_CONCURRENT).toMatchObject({
      value: 10,
      source: "default",
    });
    expect(Object.keys(data.settings)).toHaveLength(7);
    expect(data.sessionMaxAge).toEqual({ seconds: 3600, source: "env" });
    // The cache is the process tenant's, never the session's.
    expect(mockRefresh).toHaveBeenCalledWith();
  });
});

describe("one process, one tenant", () => {
  it.each([
    ["GET", () => GET()],
    ["PUT", () => put({ changes: { LOG_LEVEL: "debug" } })],
  ])(
    "%s answers 403 to an admin of another tenant and loads nothing",
    async (_m, call) => {
      mockRequireAdmin.mockResolvedValue({ userId: "a", tenantId: "t-2" });
      expect((await call()).status).toBe(403);
      expect(mockRefresh).not.toHaveBeenCalled();
      expect(mockSave).not.toHaveBeenCalled();
    },
  );
});

describe("GET /api/settings, session length", () => {
  it("an unparsable SESSION_MAX_AGE shows the 8 h default, as sign-in uses", async () => {
    process.env.SESSION_MAX_AGE = "soon";
    const { data } = await (await GET()).json();
    expect(data.sessionMaxAge).toEqual({ seconds: 28800, source: "default" });
  });
});

describe("PUT /api/settings", () => {
  it("saves with the session's tenant and user, one audit entry per changed key", async () => {
    mockSave.mockResolvedValue([
      { key: "LOG_LEVEL", old: "info", new: "debug" },
      { key: "REGISTRATION_ENABLED", old: false, new: true },
    ]);
    const res = await put({
      changes: { LOG_LEVEL: "debug", REGISTRATION_ENABLED: true },
      tenantId: "evil",
    });
    expect(res.status).toBe(200);
    expect(mockSave).toHaveBeenCalledWith("t-1", "admin-1", {
      LOG_LEVEL: "debug",
      REGISTRATION_ENABLED: true,
    });
    expect(mockAudit).toHaveBeenCalledTimes(2);
    expect(mockAudit.mock.calls[0][1]).toMatchObject({
      tenantId: "t-1",
      userId: "admin-1",
      action: "settings.update",
      details: { key: "LOG_LEVEL", old: "info", new: "debug" },
    });
  });

  it.each([
    ["an unknown key", { NOPE: 1 }],
    ["a value out of range", { QUERY_MAX_CONCURRENT: 101 }],
    ["a wrong type", { REGISTRATION_ENABLED: "true" }],
    ["max per user above max concurrent", { QUERY_MAX_PER_USER: 11 }],
  ])("refuses %s and writes nothing", async (_n, changes) => {
    const res = await put({ changes });
    expect(res.status).toBe(400);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("refuses a locked key", async () => {
    process.env.SETTINGS_LOCKED = "LOG_LEVEL";
    const res = await put({ changes: { LOG_LEVEL: "debug" } });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/locked/i);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("accepts null as a reset", async () => {
    const res = await put({ changes: { LOG_LEVEL: null } });
    expect(res.status).toBe(200);
    expect(mockSave).toHaveBeenCalledWith("t-1", "admin-1", {
      LOG_LEVEL: null,
    });
  });
});

describe("PUT /api/settings, a save that loses the race", () => {
  it("answers 400 with the rule when the authoritative pair is invalid", async () => {
    mockSave.mockRejectedValue(new SettingsValidationError("Pair is invalid."));
    const res = await put({ changes: { QUERY_MAX_PER_USER: 5 } });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("Pair is invalid.");
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
