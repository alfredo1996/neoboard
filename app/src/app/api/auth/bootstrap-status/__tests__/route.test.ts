import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAreUsersEmpty = vi.fn<() => Promise<boolean>>();

vi.mock("@/lib/auth/signup", () => ({ areUsersEmpty: mockAreUsersEmpty }));
vi.mock("next/server", () => nextResponseMockFactory());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const authReq = () =>
  new Request("http://localhost/api/auth", {
    headers: { "x-forwarded-for": "test-ip-" + Math.random() },
  });

describe("GET /api/auth/bootstrap-status", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.REGISTRATION_ENABLED;
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns bootstrapRequired: true when no users exist (registration closed by default)", async () => {
    mockAreUsersEmpty.mockResolvedValue(true);
    const res = await GET(authReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.bootstrapRequired).toBe(true);
    expect(body.data.registrationEnabled).toBe(false);
  });

  it("returns bootstrapRequired: false when users exist (registration closed by default)", async () => {
    mockAreUsersEmpty.mockResolvedValue(false);
    const res = await GET(authReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.bootstrapRequired).toBe(false);
    expect(body.data.registrationEnabled).toBe(false);
  });

  it("returns registrationEnabled: false when REGISTRATION_ENABLED=false", async () => {
    process.env.REGISTRATION_ENABLED = "false";
    mockAreUsersEmpty.mockResolvedValue(false);
    const res = await GET(authReq());
    const body = await res.json();
    expect(body.data.registrationEnabled).toBe(false);
    delete process.env.REGISTRATION_ENABLED;
  });

  it("returns registrationEnabled: false when REGISTRATION_ENABLED=False (case-insensitive)", async () => {
    process.env.REGISTRATION_ENABLED = "False";
    mockAreUsersEmpty.mockResolvedValue(false);
    vi.resetModules();
    vi.doMock("@/lib/auth/signup", () => ({
      areUsersEmpty: mockAreUsersEmpty,
    }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    const mod = await import("../route");
    const res = await mod.GET(authReq());
    const body = await res.json();
    expect(body.data.registrationEnabled).toBe(false);
    delete process.env.REGISTRATION_ENABLED;
  });

  it("returns registrationEnabled: false when REGISTRATION_ENABLED is not set (closed by default)", async () => {
    delete process.env.REGISTRATION_ENABLED;
    mockAreUsersEmpty.mockResolvedValue(false);
    const res = await GET(authReq());
    const body = await res.json();
    expect(body.data.registrationEnabled).toBe(false);
  });

  it("returns registrationEnabled: true when REGISTRATION_ENABLED=true", async () => {
    process.env.REGISTRATION_ENABLED = "true";
    mockAreUsersEmpty.mockResolvedValue(false);
    vi.resetModules();
    vi.doMock("@/lib/auth/signup", () => ({
      areUsersEmpty: mockAreUsersEmpty,
    }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    const mod = await import("../route");
    const res = await mod.GET(authReq());
    const body = await res.json();
    expect(body.data.registrationEnabled).toBe(true);
    delete process.env.REGISTRATION_ENABLED;
  });

  it("returns both bootstrapRequired and registrationEnabled together", async () => {
    process.env.REGISTRATION_ENABLED = "false";
    mockAreUsersEmpty.mockResolvedValue(true);
    vi.resetModules();
    vi.doMock("@/lib/auth/signup", () => ({
      areUsersEmpty: mockAreUsersEmpty,
    }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    const mod = await import("../route");
    const res = await mod.GET(authReq());
    const body = await res.json();
    expect(body.data.bootstrapRequired).toBe(true);
    expect(body.data.registrationEnabled).toBe(false);
    delete process.env.REGISTRATION_ENABLED;
  });
});
