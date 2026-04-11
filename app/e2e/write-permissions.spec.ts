import { test, expect, ALICE, TEST_PG_PORT } from "./fixtures";
import { AuthPage } from "./pages/auth";
import type { Browser, Page } from "@playwright/test";

/**
 * Covers issue #478 — Form widget write-permission enforcement.
 *
 * These tests complement form-widget.spec.ts rather than duplicate it.
 * form-widget.spec.ts already covers:
 *   - happy-path submit (Alice admin → success message)
 *   - creator with canWrite=false, UI click → "Write permission required"
 *
 * What's NEW here:
 *   1. Reader role denied at API (no reader test exists anywhere)
 *   2. canWrite=false creator denied at API (direct POST, complements the UI-only existing test)
 *   3. canWrite toggle propagates to active sessions without re-login
 *   4. Write query runtime errors return a safe user-facing message
 *
 * Implementation notes:
 *   - Each test uses the built-in `page` fixture as the admin session (already
 *     a fresh browser context, no extra login traffic) and creates ONE extra
 *     context for the ad-hoc creator/reader. Keeping the extra-context count
 *     low matters: every extra /login navigation adds load to the dev server
 *     and can destabilize the existing hydration race in AuthPage.login.
 *   - Ad-hoc users are created via POST /api/users (admin) for isolation from
 *     tests that rely on BOB's state.
 *   - The canWrite check in /api/query/write (route.ts:27-29) runs BEFORE the
 *     connection ownership check (line 38-52), so denial tests can hit the
 *     write endpoint with any connection id — no per-user connection setup
 *     needed for denial paths.
 *   - NextAuth's jwt callback (lib/auth/config.ts:99-126) re-fetches role and
 *     canWrite from the DB on every token refresh, so a live PATCH propagates
 *     to active sessions immediately. Test 3 verifies that property.
 */

async function newSessionAs(
  browser: Browser,
  email: string,
  password: string,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await new AuthPage(page).login(email, password);
  return { page, close: () => context.close() };
}

/**
 * Admin helper: create an ad-hoc user and return a cleanup function.
 * The returned cleanup calls DELETE /api/users/{id} as admin.
 */
async function createAdHocUser(
  adminPage: Page,
  {
    role,
    canWrite,
  }: {
    role: "creator" | "reader";
    canWrite: boolean;
  },
): Promise<{
  id: string;
  email: string;
  password: string;
  cleanup: () => Promise<void>;
}> {
  const timestamp = Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = `${role}-${timestamp}-${suffix}@example.com`;
  const password = "password123";

  const res = await adminPage.request.post("/api/users", {
    data: {
      name: `E2E ${role} ${suffix}`,
      email,
      password,
      role,
      canWrite,
    },
  });
  if (!res.ok()) {
    throw new Error(
      `createAdHocUser(${role}) failed: ${res.status()} ${await res.text()}`,
    );
  }
  const { data: user } = await res.json();
  return {
    id: user.id as string,
    email,
    password,
    cleanup: async () => {
      await adminPage.request.delete(`/api/users/${user.id}`);
    },
  };
}

test.describe("Form widget — write permission enforcement", () => {
  test.describe.configure({ timeout: 60_000 });

  // Every test logs in as Alice on the built-in `page` fixture, so that
  // context serves as the admin session without allocating a second browser
  // context just to hold admin cookies. AuthPage.login handles the
  // pre-hydration submit race upstream (see app/e2e/pages/auth.ts).
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("1. reader role is denied at /api/query/write (403)", async ({
    page,
    browser,
  }) => {
    const reader = await createAdHocUser(page, {
      role: "reader",
      canWrite: false,
    });

    const readerSession = await newSessionAs(
      browser,
      reader.email,
      reader.password,
    );
    try {
      // The canWrite check fires BEFORE the connection ownership check
      // (app/src/app/api/query/write/route.ts:27-29), so any connection id
      // produces the same 403 for a reader.
      const res = await readerSession.page.request.post("/api/query/write", {
        data: {
          connectionId: "conn-neo4j-001",
          query: "CREATE (n:ReaderTest) RETURN n",
        },
      });
      expect(res.status()).toBe(403);

      const body = await res.json();
      expect(body.error?.message).toMatch(/write permission required/i);
    } finally {
      await readerSession.close();
      await reader.cleanup();
    }
  });

  test("2. creator with canWrite=false is denied at /api/query/write (403)", async ({
    page,
    browser,
  }) => {
    // Create the creator already disabled so the first login carries the
    // correct JWT claim — no re-login dance needed for this test.
    const creator = await createAdHocUser(page, {
      role: "creator",
      canWrite: false,
    });

    const creatorSession = await newSessionAs(
      browser,
      creator.email,
      creator.password,
    );
    try {
      const res = await creatorSession.page.request.post("/api/query/write", {
        data: {
          connectionId: "conn-pg-001",
          query: "INSERT INTO movies (title) VALUES ('x')",
        },
      });
      expect(res.status()).toBe(403);

      const body = await res.json();
      expect(body.error?.message).toMatch(/write permission required/i);
    } finally {
      await creatorSession.close();
      await creator.cleanup();
    }
  });

  test("3. canWrite toggle propagates to active sessions without re-login", async ({
    page,
    browser,
  }) => {
    // This test pins an important security property: when an admin disables
    // canWrite on a creator, the creator's ACTIVE session stops being able to
    // write *immediately* — no re-login, no session expiry, no page reload.
    // Without this, a compromised or misbehaving user could keep writing long
    // after their permission was revoked.
    //
    // The mechanism lives in lib/auth/config.ts:99-126 — the jwt callback
    // re-fetches role/canWrite from the DB on every token refresh, so the
    // value in session.user.canWrite always matches the DB row.

    const creator = await createAdHocUser(page, {
      role: "creator",
      canWrite: true,
    });

    const creatorSession = await newSessionAs(
      browser,
      creator.email,
      creator.password,
    );
    let connectionId: string | null = null;

    try {
      // Creator needs to own a connection so /api/query/write reaches the
      // executor rather than hitting the 404 connection-ownership branch.
      const connRes = await creatorSession.page.request.post(
        "/api/connections",
        {
          data: {
            name: `write-perm-test-${Date.now()}`,
            type: "postgresql",
            config: {
              uri: `postgresql://localhost:${TEST_PG_PORT}`,
              username: "neoboard",
              password: "neoboard",
              database: "movies",
            },
          },
        },
      );
      expect(connRes.status()).toBe(201);
      connectionId = (await connRes.json()).data.id as string;

      // Step 1: creator has canWrite=true → harmless SELECT succeeds inside
      // the WRITE transaction.
      const pre = await creatorSession.page.request.post("/api/query/write", {
        data: { connectionId, query: "SELECT 1 AS ok" },
      });
      expect(pre.status()).toBe(200);

      // Step 2: admin revokes canWrite via the users API.
      const patchRes = await page.request.patch(`/api/users/${creator.id}`, {
        data: { canWrite: false },
      });
      expect(patchRes.ok()).toBeTruthy();
      expect((await patchRes.json()).data.canWrite).toBe(false);

      // Step 3: the SAME creator session — no re-login, no cookie refresh —
      // must now be denied. This is the security-critical assertion.
      const post = await creatorSession.page.request.post("/api/query/write", {
        data: { connectionId, query: "SELECT 1 AS ok" },
      });
      expect(post.status()).toBe(403);
      expect((await post.json()).error?.message).toMatch(
        /write permission required/i,
      );
    } finally {
      if (connectionId) {
        await creatorSession.page.request
          .delete(`/api/connections/${connectionId}`)
          .catch(() => undefined);
      }
      await creatorSession.close();
      await creator.cleanup();
    }
  });

  test("4. write query runtime error returns safe 500 message", async ({
    page,
    browser,
  }) => {
    const creator = await createAdHocUser(page, {
      role: "creator",
      canWrite: true,
    });

    const creatorSession = await newSessionAs(
      browser,
      creator.email,
      creator.password,
    );
    let connectionId: string | null = null;

    try {
      const connRes = await creatorSession.page.request.post(
        "/api/connections",
        {
          data: {
            name: `runtime-error-test-${Date.now()}`,
            type: "postgresql",
            config: {
              uri: `postgresql://localhost:${TEST_PG_PORT}`,
              username: "neoboard",
              password: "neoboard",
              database: "movies",
            },
          },
        },
      );
      expect(connRes.status()).toBe(201);
      connectionId = (await connRes.json()).data.id as string;

      // Intentionally broken SQL — the executor will throw; the route should
      // translate that into a 500 with a user-safe message and NOT leak the
      // raw driver error.
      const res = await creatorSession.page.request.post("/api/query/write", {
        data: {
          connectionId,
          query: "THIS IS NOT VALID SQL",
        },
      });
      expect(res.status()).toBe(500);

      const body = await res.json();
      expect(body.error?.message).toBe("Write query execution failed");
      // Safety check: raw driver syntax errors must not bleed through.
      expect(body.error?.message).not.toMatch(/syntax error at or near/i);
    } finally {
      if (connectionId) {
        await creatorSession.page.request
          .delete(`/api/connections/${connectionId}`)
          .catch(() => undefined);
      }
      await creatorSession.close();
      await creator.cleanup();
    }
  });
});
