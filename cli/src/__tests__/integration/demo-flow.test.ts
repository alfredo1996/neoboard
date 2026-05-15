/**
 * CLI Integration Test — Full Demo Flow
 *
 * Runs REAL Docker containers, REAL migrations, REAL seed.
 * Verifies the full `neoboard demo` flow produces a working environment:
 *   - Containers start and become healthy
 *   - Migrations apply successfully
 *   - Seed creates users with valid credentials
 *   - Seed creates connections with properly encrypted configs
 *   - Login works with seeded credentials
 *   - Connection test succeeds for both Neo4j and PostgreSQL
 *
 * Prerequisites:
 *   - Docker daemon running
 *   - Ports 3000, 5432, 7474, 7687 available
 *   - app/.env.local exists with ENCRYPTION_KEY
 *
 * Run: npx vitest run src/__tests__/integration/demo-flow.test.ts --timeout 120000
 *
 * Skip in CI where containers are managed differently:
 *   SKIP_INTEGRATION=1 npx vitest run
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Skip if Docker is not available or SKIP_INTEGRATION is set
// ---------------------------------------------------------------------------

const SKIP = process.env.SKIP_INTEGRATION === "1" || !isDockerAvailable();

function isDockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const ROOT = resolve(import.meta.dirname, "../../../..");
const APP_URL = "http://localhost:3000";
const COMPOSE_FILE = resolve(ROOT, "docker/docker-compose.full.yml");

// Read ENCRYPTION_KEY from app/.env.local for verification
function getEncryptionKey(): string | null {
  const envPath = resolve(ROOT, "app/.env.local");
  if (!existsSync(envPath)) return null;
  const content = readFileSync(envPath, "utf-8");
  const match = content.match(/^ENCRYPTION_KEY=(.+)$/m);
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/** Extract set-cookie values from a Response, compatible across Node versions. */
function extractCookies(res: Response): string {
  // Prefer getSetCookie() (Node 20+) — returns individual cookie strings
  const cookies = res.headers.getSetCookie?.();
  if (cookies && cookies.length > 0) {
    return cookies.map((c) => c.split(";")[0]).join("; ");
  }
  // Fallback: get("set-cookie") returns all cookies joined
  return res.headers.get("set-cookie") ?? "";
}

async function fetchJson(
  url: string,
  opts?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, opts);
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

async function login(email: string, password: string): Promise<string | null> {
  // 1. Get CSRF token + cookies
  const csrfRes = await fetch(`${APP_URL}/api/auth/csrf`);
  const csrfBody = (await csrfRes.json()) as { csrfToken: string };

  // Forward CSRF cookies — fetch() doesn't persist cookies across requests
  const csrfCookieHeader = extractCookies(csrfRes);

  // 2. POST credentials
  const loginRes = await fetch(`${APP_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookieHeader,
    },
    body: new URLSearchParams({
      csrfToken: csrfBody.csrfToken,
      email,
      password,
    }),
    redirect: "manual",
  });

  // 3. Extract session token from response cookies
  const allCookies = extractCookies(loginRes);
  const match = allCookies.match(
    /(?:__Secure-)?authjs\.session-token=([^;,\s]+)/,
  );
  return match?.[1] ?? null;
}

async function waitForApp(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${APP_URL}/login`, { redirect: "manual" });
      if (res.status === 200) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`App not ready after ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(SKIP)("CLI Demo Flow — Integration", () => {
  beforeAll(async () => {
    // Ensure containers are running (don't rebuild — use current state)
    try {
      execSync(`docker compose -f ${COMPOSE_FILE} up -d`, {
        cwd: ROOT,
        stdio: "pipe",
        env: { ...process.env, FORCE_HTTPS: "false" },
      });
    } catch (e) {
      console.error("Failed to start containers:", e);
      throw e;
    }

    // Wait for app to be ready
    await waitForApp(90_000);

    // Run migrations
    const envLocal = resolve(ROOT, "app/.env.local");
    if (existsSync(envLocal)) {
      const content = readFileSync(envLocal, "utf-8");
      const dbUrl = content.match(/^DATABASE_URL=(.+)$/m)?.[1];
      if (dbUrl) {
        execSync("npx drizzle-kit migrate", {
          cwd: resolve(ROOT, "app"),
          stdio: "pipe",
          env: { ...process.env, DATABASE_URL: dbUrl },
        });
      }
    }

    // Run seed with Docker hostnames
    execSync(`node scripts/seed-demo.mjs`, {
      cwd: ROOT,
      stdio: "pipe",
      env: {
        ...process.env,
        NEO4J_HOST: "neoboard-neo4j",
        PG_HOST: "neoboard-postgres",
      },
    });
  }, 120_000);

  // -------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------

  it("health endpoint returns ok", async () => {
    // Health is behind auth middleware in some configs, so try public
    // bootstrap-status which is always public
    const { status } = await fetchJson(`${APP_URL}/api/auth/bootstrap-status`);
    expect(status).toBe(200);
  });

  it("login page loads without HTTPS redirect", async () => {
    const res = await fetch(`${APP_URL}/login`);
    expect(res.status).toBe(200);
    const html = await res.text();
    // Title is in SSR output even when page is client-rendered
    expect(html).toContain("NeoBoard");
  });

  // -------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------

  it("rejects invalid credentials", async () => {
    const token = await login("nobody@example.com", "wrongpassword");
    expect(token).toBeNull();
  });

  it("accepts valid seed credentials", async () => {
    // The seed creates users from seed-neoboard.sql with admin123
    const token = await login("admin@neoboard.local", "admin123");
    expect(token).not.toBeNull();
  });

  // -------------------------------------------------------------------
  // Connections — encrypted config integrity
  // -------------------------------------------------------------------

  it("stored connections have encrypted configs with uri field", async () => {
    const encryptionKey = getEncryptionKey();
    if (!encryptionKey) {
      console.warn("No ENCRYPTION_KEY found — skipping encryption check");
      return;
    }

    // Query the database directly via the container
    const result = execSync(
      `docker exec neoboard-postgres psql -U neoboard -d neoboard -t -A -c "SELECT name, \\"configEncrypted\\" FROM connection"`,
      { encoding: "utf-8" },
    );

    const lines = result.trim().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);

    // Verify each connection has encrypted config (base64:base64:base64 format)
    for (const line of lines) {
      const [name, configEncrypted] = line.split("|");
      const parts = configEncrypted.split(":");
      expect(parts.length).toBe(3); // iv:tag:ciphertext — not plaintext JSON
      // Verify each part is valid base64
      for (const part of parts) {
        expect(() => Buffer.from(part, "base64")).not.toThrow();
      }

      // Decrypt and verify uri field exists
      const { createDecipheriv } = await import("node:crypto");
      const key = Buffer.from(encryptionKey, "hex");
      const iv = Buffer.from(parts[0], "base64");
      const authTag = Buffer.from(parts[1], "base64");
      const encrypted = Buffer.from(parts[2], "base64");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = JSON.parse(
        decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8"),
      );

      expect(decrypted.uri).toBeDefined();
      expect(typeof decrypted.uri).toBe("string");
      expect(decrypted.uri.length).toBeGreaterThan(0);
      expect(decrypted.username).toBeDefined();
      expect(decrypted.password).toBeDefined();

      // Verify URI has valid protocol
      if (name.toLowerCase().includes("neo4j")) {
        expect(decrypted.uri).toMatch(/^(bolt|neo4j)/);
      } else {
        expect(decrypted.uri).toMatch(/^postgresql/);
      }
    }
  });

  // -------------------------------------------------------------------
  // Connection test — can actually connect to databases
  // -------------------------------------------------------------------

  it("Neo4j connection test succeeds via API", async () => {
    const token = await login("admin@neoboard.local", "admin123");
    expect(token).not.toBeNull();
    const cookie = `authjs.session-token=${token}`;

    // Create a connection owned by alice (test endpoint requires ownership)
    const createRes = await fetchJson(`${APP_URL}/api/connections`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Integration Test Neo4j",
        type: "neo4j",
        config: {
          uri: "bolt://neoboard-neo4j:7687",
          username: "neo4j",
          password: "neoboard123",
          database: "neo4j",
        },
      }),
    });
    expect(createRes.status).toBe(201);
    const connId = (createRes.body.data as { id: string }).id;

    // Test the connection
    const testRes = await fetchJson(
      `${APP_URL}/api/connections/${connId}/test`,
      { method: "POST", headers: { Cookie: cookie } },
    );
    expect(testRes.status).toBe(200);

    // Cleanup
    await fetch(`${APP_URL}/api/connections/${connId}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
  });

  it("PostgreSQL connection test succeeds via API", async () => {
    const token = await login("admin@neoboard.local", "admin123");
    expect(token).not.toBeNull();
    const cookie = `authjs.session-token=${token}`;

    const createRes = await fetchJson(`${APP_URL}/api/connections`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Integration Test PostgreSQL",
        type: "postgresql",
        config: {
          uri: "postgresql://neoboard-postgres:5432",
          username: "neoboard",
          password: "neoboard",
          database: "neoboard",
        },
      }),
    });
    expect(createRes.status).toBe(201);
    const connId = (createRes.body.data as { id: string }).id;

    const testRes = await fetchJson(
      `${APP_URL}/api/connections/${connId}/test`,
      { method: "POST", headers: { Cookie: cookie } },
    );
    expect(testRes.status).toBe(200);

    await fetch(`${APP_URL}/api/connections/${connId}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
  });

  // -------------------------------------------------------------------
  // Query execution — end to end
  // -------------------------------------------------------------------

  it("executes a Cypher query against Neo4j", async () => {
    const token = await login("admin@neoboard.local", "admin123");
    expect(token).not.toBeNull();
    const cookie = `authjs.session-token=${token}`;

    // Create owned connection for query execution
    const createRes = await fetchJson(`${APP_URL}/api/connections`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Query Test Neo4j",
        type: "neo4j",
        config: {
          uri: "bolt://neoboard-neo4j:7687",
          username: "neo4j",
          password: "neoboard123",
        },
      }),
    });
    expect(createRes.status).toBe(201);
    const connId = (createRes.body.data as { id: string }).id;

    const { status, body } = await fetchJson(`${APP_URL}/api/query`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId: connId,
        query: "MATCH (n) RETURN count(n) AS count",
      }),
    });
    expect(status).toBe(200);
    expect(body.data).toBeDefined();

    await fetch(`${APP_URL}/api/connections/${connId}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
  });

  it("executes a SQL query against PostgreSQL", async () => {
    const token = await login("admin@neoboard.local", "admin123");
    expect(token).not.toBeNull();
    const cookie = `authjs.session-token=${token}`;

    const createRes = await fetchJson(`${APP_URL}/api/connections`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Query Test PostgreSQL",
        type: "postgresql",
        config: {
          uri: "postgresql://neoboard-postgres:5432",
          username: "neoboard",
          password: "neoboard",
          database: "neoboard",
        },
      }),
    });
    expect(createRes.status).toBe(201);
    const connId = (createRes.body.data as { id: string }).id;

    const { status, body } = await fetchJson(`${APP_URL}/api/query`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId: connId,
        query: "SELECT 1 AS test",
      }),
    });
    expect(status).toBe(200);
    expect(body.data).toBeDefined();

    await fetch(`${APP_URL}/api/connections/${connId}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
  });
});
