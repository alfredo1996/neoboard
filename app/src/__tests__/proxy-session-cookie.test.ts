import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createActionURL } from "@auth/core";
import { encode } from "@auth/core/jwt";
import { proxy } from "../proxy";

// #1792 — no next-auth/jwt mock here: the real getToken reads a real Auth.js
// JWT, so the test fails if the proxy looks under a different cookie name than
// the one Auth.js wrote the session to.

const SECRET = "proxy-session-cookie-test-secret-1792";
const PLAIN = "authjs.session-token";
const SECURE = "__Secure-authjs.session-token";

type Case = {
  name: string;
  url: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  cookie: string;
};

const cases: Case[] = [
  { name: "plain HTTP", url: "http://localhost:3000/connections", cookie: PLAIN },
  { name: "HTTPS", url: "https://neoboard.example.com/connections", cookie: SECURE },
  {
    name: "TLS terminated upstream (X-Forwarded-Proto: https)",
    url: "http://neoboard.internal:3000/connections",
    headers: { "x-forwarded-proto": "https" },
    cookie: SECURE,
  },
  {
    name: "https AUTH_URL",
    url: "http://neoboard.internal:3000/connections",
    env: { AUTH_URL: "https://neoboard.example.com" },
    cookie: SECURE,
  },
  {
    name: "https NEXTAUTH_URL",
    url: "http://neoboard.internal:3000/connections",
    env: { NEXTAUTH_URL: "https://neoboard.example.com" },
    cookie: SECURE,
  },
  {
    name: "http AUTH_URL wins over X-Forwarded-Proto",
    url: "http://neoboard.internal:3000/connections",
    headers: { "x-forwarded-proto": "https" },
    env: { AUTH_URL: "http://neoboard.internal:3000" },
    cookie: PLAIN,
  },
  {
    name: "AUTH_URL wins over NEXTAUTH_URL",
    url: "http://neoboard.internal:3000/connections",
    env: {
      AUTH_URL: "http://neoboard.internal:3000",
      NEXTAUTH_URL: "https://neoboard.example.com",
    },
    cookie: PLAIN,
  },
  {
    // The Compose default behind a TLS proxy: NEXTAUTH_URL=http://localhost:3000.
    name: "http NEXTAUTH_URL wins over X-Forwarded-Proto",
    url: "http://neoboard.internal:3000/connections",
    headers: { "x-forwarded-proto": "https" },
    env: { NEXTAUTH_URL: "http://neoboard.internal:3000" },
    cookie: PLAIN,
  },
];

function stubEnv(env: Record<string, string> = {}) {
  vi.stubEnv("NEXTAUTH_SECRET", SECRET);
  vi.stubEnv("AUTH_URL", env.AUTH_URL);
  vi.stubEnv("NEXTAUTH_URL", env.NEXTAUTH_URL);
}

async function requestWithSession(
  url: string,
  cookieName: string,
  headers: Record<string, string> = {},
): Promise<NextRequest> {
  // Auth.js salts the JWT with its cookie name, so mint it for that name.
  const token = await encode({
    token: { sub: "user-1", email: "a@example.com" },
    secret: SECRET,
    salt: cookieName,
  });
  return new NextRequest(url, {
    headers: { ...headers, cookie: `${cookieName}=${token}` },
  });
}

/** The session cookie name Auth.js itself uses for this request. */
function authJsCookieName(req: NextRequest): string {
  const { protocol } = createActionURL(
    "session",
    req.nextUrl.protocol,
    req.headers,
    process.env,
    {},
  );
  return protocol === "https:" ? SECURE : PLAIN;
}

describe("proxy session cookie name (#1792)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(cases)(
    "$name: admits a session under the name Auth.js uses",
    async ({ url, headers, env, cookie }) => {
      stubEnv(env);
      const req = await requestWithSession(url, cookie, headers);
      expect(authJsCookieName(req)).toBe(cookie);

      const res = await proxy(req);

      expect(res.status).toBe(200);
    },
  );

  it.each(cases)(
    "$name: ignores a session under the other name",
    async ({ url, headers, env, cookie }) => {
      stubEnv(env);
      const other = cookie === SECURE ? PLAIN : SECURE;
      const req = await requestWithSession(url, other, headers);

      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    },
  );

  it("lets a session API call through over HTTPS instead of returning 401", async () => {
    stubEnv();
    const req = await requestWithSession(
      "https://neoboard.example.com/api/dashboards",
      SECURE,
    );

    const res = await proxy(req);

    expect(res.status).toBe(200);
  });
});
