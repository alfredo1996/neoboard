import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetToken = vi.fn();

vi.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}));

// Import after mocks
const { proxy, config } = await import("../proxy");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  pathname: string,
  options?: { headers?: Record<string, string> },
): NextRequest {
  const url = new URL(pathname, "http://localhost:3000");
  return {
    nextUrl: url,
    headers: new Headers(options?.headers ?? {}),
  } as unknown as NextRequest;
}

function matchesRoute(pathname: string): boolean {
  const pattern = config.matcher[0];
  const regex = new RegExp(`^${pattern}$`);
  return regex.test(pathname);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue(null);
  });

  describe("matcher config", () => {
    it("excludes static assets", () => {
      expect(matchesRoute("/_next/static/chunk.js")).toBe(false);
      expect(matchesRoute("/_next/image/foo")).toBe(false);
      expect(matchesRoute("/favicon.ico")).toBe(false);
    });

    it("includes page routes", () => {
      expect(matchesRoute("/")).toBe(true);
      expect(matchesRoute("/connections")).toBe(true);
      expect(matchesRoute("/login")).toBe(true);
    });

    it("includes API routes", () => {
      expect(matchesRoute("/api/dashboards")).toBe(true);
      expect(matchesRoute("/api/query")).toBe(true);
    });
  });

  describe("public routes", () => {
    it("passes through /login", async () => {
      const res = await proxy(makeRequest("/login"));
      expect(res.status).toBe(200);
    });

    it("passes through /signup", async () => {
      const res = await proxy(makeRequest("/signup"));
      expect(res.status).toBe(200);
    });

    it("passes through /change-password", async () => {
      const res = await proxy(makeRequest("/change-password"));
      expect(res.status).toBe(200);
    });

    it("passes through /api/auth/* routes", async () => {
      const res = await proxy(makeRequest("/api/auth/session"));
      expect(res.status).toBe(200);
    });

    it("passes through /api/auth/bootstrap-status", async () => {
      const res = await proxy(makeRequest("/api/auth/bootstrap-status"));
      expect(res.status).toBe(200);
    });

    it("passes through /api/docs", async () => {
      const res = await proxy(makeRequest("/api/docs"));
      expect(res.status).toBe(200);
    });

    it("passes through /api/openapi", async () => {
      const res = await proxy(makeRequest("/api/openapi"));
      expect(res.status).toBe(200);
    });

    it("passes through /api/openapi.json", async () => {
      const res = await proxy(makeRequest("/api/openapi.json"));
      expect(res.status).toBe(200);
    });
  });

  describe("unauthenticated requests", () => {
    it("redirects page requests to /login", async () => {
      const res = await proxy(makeRequest("/connections"));
      expect(res.status).toBe(307);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/login");
      expect(location).toContain("callbackUrl=%2Fconnections");
    });

    it("returns 401 JSON for API requests", async () => {
      const res = await proxy(makeRequest("/api/dashboards"));
      expect(res.status).toBe(401);
      expect(res.headers.get("content-type")).toContain("application/json");
    });
  });

  describe("API key passthrough", () => {
    it("passes through nb_ Bearer tokens on API routes", async () => {
      const res = await proxy(
        makeRequest("/api/dashboards", {
          headers: { authorization: "Bearer nb_test_key_abc123" },
        }),
      );
      expect(res.status).toBe(200);
    });

    it("does not pass through non-nb_ tokens", async () => {
      const res = await proxy(
        makeRequest("/api/dashboards", {
          headers: { authorization: "Bearer some_other_token" },
        }),
      );
      expect(res.status).toBe(401);
    });

    it("does not pass through nb_ tokens on page routes", async () => {
      const res = await proxy(
        makeRequest("/connections", {
          headers: { authorization: "Bearer nb_test_key" },
        }),
      );
      expect(res.status).toBe(307);
    });
  });

  describe("authenticated requests", () => {
    it("passes through authenticated page requests", async () => {
      mockGetToken.mockResolvedValue({ sub: "user-1" });
      const res = await proxy(makeRequest("/"));
      expect(res.status).toBe(200);
    });

    it("passes through authenticated API requests", async () => {
      mockGetToken.mockResolvedValue({ sub: "user-1" });
      const res = await proxy(makeRequest("/api/dashboards"));
      expect(res.status).toBe(200);
    });

    it("redirects to /change-password when forcePasswordChange is true", async () => {
      mockGetToken.mockResolvedValue({
        sub: "user-1",
        forcePasswordChange: true,
      });
      const res = await proxy(makeRequest("/connections"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/change-password");
    });

    it("does not redirect to /change-password for API routes", async () => {
      mockGetToken.mockResolvedValue({
        sub: "user-1",
        forcePasswordChange: true,
      });
      const res = await proxy(makeRequest("/api/dashboards"));
      expect(res.status).toBe(200);
    });

    it("does not redirect when already on /change-password", async () => {
      mockGetToken.mockResolvedValue({
        sub: "user-1",
        forcePasswordChange: true,
      });
      const res = await proxy(makeRequest("/change-password"));
      // /change-password is a public route, so it passes through before token check
      expect(res.status).toBe(200);
    });
  });
});
