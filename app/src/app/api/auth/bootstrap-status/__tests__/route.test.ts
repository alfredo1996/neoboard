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

describe("GET /api/auth/bootstrap-status", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: () => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns bootstrapRequired: true when no users exist", async () => {
    mockAreUsersEmpty.mockResolvedValue(true);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.bootstrapRequired).toBe(true);
    expect(body.data.registrationEnabled).toBe(true);
  });

  it("returns bootstrapRequired: false when users exist", async () => {
    mockAreUsersEmpty.mockResolvedValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.bootstrapRequired).toBe(false);
    expect(body.data.registrationEnabled).toBe(true);
  });

  it("returns registrationEnabled: false when REGISTRATION_ENABLED=false", async () => {
    process.env.REGISTRATION_ENABLED = "false";
    mockAreUsersEmpty.mockResolvedValue(false);
    const res = await GET();
    const body = await res.json();
    expect(body.data.registrationEnabled).toBe(false);
    delete process.env.REGISTRATION_ENABLED;
  });
});
