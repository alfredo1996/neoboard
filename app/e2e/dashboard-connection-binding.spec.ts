import {
  test,
  expect,
  ALICE,
  TEST_NEO4J_BOLT_URL,
  createTestDashboard,
} from "./fixtures";
import { AuthPage } from "./pages/auth";
import type {
  APIRequestContext,
  APIResponse,
  Browser,
  BrowserContext,
} from "@playwright/test";

/**
 * A viewer share runs only the queries its dashboard contains (#972). Owning
 * or editing a dashboard that names a connection lifts that limit only while
 * the dashboard's owner can use the connection and the caller may write, and
 * no write may leave a caller holding such a dashboard on a connection they
 * cannot use directly (#1816). Every connection here is Alice's and private
 * unless a test shares it, and every row is created under a unique name and
 * deleted by id.
 */

const ON_DASHBOARD = "MATCH (m:Movie) RETURN m.title AS title LIMIT 3";
const NOT_ON_DASHBOARD = "MATCH (p:Person) RETURN p.name AS name LIMIT 3";

function layoutOn(connectionId: string, query: string) {
  return {
    version: 2,
    pages: [
      {
        id: "p1",
        title: "Page 1",
        widgets: [
          {
            id: "w1",
            chartType: "table",
            connectionId,
            query,
            settings: { title: "Rows" },
          },
        ],
        gridLayout: [{ i: "w1", x: 0, y: 0, w: 6, h: 6 }],
      },
    ],
  };
}

type Role = "admin" | "creator" | "reader";

interface Scene {
  alice: APIRequestContext;
  suffix: string;
  /** Dashboards created in the test, deleted by id afterwards. */
  created: string[];
  /** A user Alice creates; `login` signs them in on a fresh context. */
  newUser(
    role: Role,
  ): Promise<{
    id: string;
    email: string;
    login(): Promise<APIRequestContext>;
  }>;
  /** A private connection of Alice's. */
  newConnection(): Promise<string>;
}

async function withScene(browser: Browser, fn: (s: Scene) => Promise<void>) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const created: string[] = [];
  const userIds: string[] = [];
  const connectionIds: string[] = [];
  const contexts: BrowserContext[] = [];
  const aliceCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  try {
    await new AuthPage(alice).login(ALICE.email, ALICE.password);
    await fn({
      alice: alice.request,
      suffix,
      created,
      async newUser(role) {
        const email = `binding-${userIds.length}-${suffix}@example.com`;
        const password = "password123";
        const res = await alice.request.post("/api/users", {
          data: { name: `Binding ${suffix}`, email, password, role },
        });
        expect(res.status()).toBe(201);
        const id = (await res.json()).data.id as string;
        userIds.push(id);
        return {
          id,
          email,
          async login() {
            const ctx = await browser.newContext();
            contexts.push(ctx);
            const page = await ctx.newPage();
            await new AuthPage(page).login(email, password);
            return page.request;
          },
        };
      },
      async newConnection() {
        const res = await alice.request.post("/api/connections", {
          data: {
            name: `binding-${connectionIds.length}-${suffix}`,
            type: "neo4j",
            config: {
              uri: TEST_NEO4J_BOLT_URL,
              username: "neo4j",
              password: "neoboard123",
              // The server keeps one driver per distinct connection config, and
              // deleting any connection closes the driver for its config. A
              // unique timeout keeps this test's driver apart from every other
              // connection to the same database, so a cleanup elsewhere cannot
              // close it mid-query.
              connectionTimeout: 20_000 + Math.floor(Math.random() * 280_000),
            },
          },
        });
        expect(res.status()).toBe(201);
        const id = (await res.json()).data.id as string;
        connectionIds.push(id);
        return id;
      },
    });
  } finally {
    for (const ctx of contexts) await ctx.close();
    for (const id of created) {
      await alice.request.delete(`/api/dashboards/${id}`);
    }
    for (const id of connectionIds) {
      await alice.request.delete(`/api/connections/${id}?force=true`);
    }
    for (const id of userIds) await alice.request.delete(`/api/users/${id}`);
    await aliceCtx.close();
  }
}

interface Shared {
  creator: APIRequestContext;
  connectionId: string;
  dashboardId: string;
  suffix: string;
  /** Dashboards the creator ends up owning, deleted by id afterwards. */
  created: string[];
}

/** Alice's dashboard on her private connection, shared with a new user. */
async function withPrivateConnectionShared(
  browser: Browser,
  role: "viewer" | "editor",
  fn: (s: Shared) => Promise<void>,
  userRole: Role = "creator",
) {
  await withScene(browser, async (scene) => {
    const user = await scene.newUser(userRole);
    const connectionId = await scene.newConnection();
    const { id: dashboardId } = await createTestDashboard(
      scene.alice,
      `binding-${scene.suffix}`,
    );
    scene.created.push(dashboardId);
    const put = await scene.alice.put(`/api/dashboards/${dashboardId}`, {
      data: { layoutJson: layoutOn(connectionId, ON_DASHBOARD) },
    });
    expect(put.status()).toBe(200);
    const share = await scene.alice.post(
      `/api/dashboards/${dashboardId}/share`,
      { data: { email: user.email, role } },
    );
    expect(share.status()).toBe(201);
    await fn({
      creator: await user.login(),
      connectionId,
      dashboardId,
      suffix: scene.suffix,
      created: scene.created,
    });
  });
}

/** A dashboard of the caller's own, recorded for cleanup at once. */
async function dashboardOf(
  request: APIRequestContext,
  scene: { suffix: string; created: string[] },
  label: string,
): Promise<string> {
  const res = await request.post("/api/dashboards", {
    data: { name: `binding-${label}-${scene.suffix}` },
  });
  expect(res.status()).toBe(201);
  const id = (await res.json()).data.id as string;
  scene.created.push(id);
  return id;
}

async function ownDashboard(s: Shared, label: string): Promise<string> {
  return dashboardOf(s.creator, s, label);
}

/** Record a dashboard a refused request created anyway, so it is cleaned up. */
async function recordCreated(s: Shared, res: APIResponse) {
  if (res.status() === 201) {
    s.created.push((await res.json()).data.id as string);
  }
}

async function errorOf(res: APIResponse): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.error?.message ?? "";
}

function runOn(
  request: APIRequestContext,
  connectionId: string,
  query: string,
) {
  return request.post("/api/query", { data: { connectionId, query } });
}

/**
 * The caller runs the dashboard's saved query on the connection and nothing
 * new, not even by saving the new query onto the dashboard first.
 */
async function expectBound(
  request: APIRequestContext,
  dashboardId: string,
  connectionId: string,
) {
  expect((await runOn(request, connectionId, ON_DASHBOARD)).status()).toBe(200);
  expect((await runOn(request, connectionId, NOT_ON_DASHBOARD)).status()).toBe(
    403,
  );
  const resave = await request.put(`/api/dashboards/${dashboardId}`, {
    data: { layoutJson: layoutOn(connectionId, NOT_ON_DASHBOARD) },
  });
  expect(resave.status()).toBe(403);
  expect(await errorOf(resave)).toMatch(/connection/i);
  expect((await runOn(request, connectionId, NOT_ON_DASHBOARD)).status()).toBe(
    403,
  );
}

test.describe("Dashboard connection binding (#1816)", () => {
  test.describe.configure({ timeout: 90_000 });

  test("a viewer share cannot lift the binding by duplicating, saving or importing", async ({
    browser,
  }) => {
    await withPrivateConnectionShared(browser, "viewer", async (s) => {
      const run = (query: string) =>
        s.creator.post("/api/query", {
          data: { connectionId: s.connectionId, query },
        });

      // The binding as the share grants it: the dashboard's query runs, another does not.
      expect((await run(ON_DASHBOARD)).status()).toBe(200);
      expect((await run(NOT_ON_DASHBOARD)).status()).toBe(403);

      const duplicate = await s.creator.post(
        `/api/dashboards/${s.dashboardId}/duplicate`,
      );
      await recordCreated(s, duplicate);
      expect.soft(duplicate.status()).toBe(403);
      expect.soft(await errorOf(duplicate)).toMatch(/connection/i);

      const ownId = await ownDashboard(s, "own");
      const save = await s.creator.put(`/api/dashboards/${ownId}`, {
        data: { layoutJson: layoutOn(s.connectionId, NOT_ON_DASHBOARD) },
      });
      expect.soft(save.status()).toBe(403);
      expect.soft(await errorOf(save)).toMatch(/connection/i);

      const imported = await s.creator.post("/api/dashboards/import", {
        data: {
          payload: {
            formatVersion: 1,
            exportedAt: new Date().toISOString(),
            dashboard: { name: `binding-import-${s.suffix}` },
            connections: {},
            layout: layoutOn(s.connectionId, NOT_ON_DASHBOARD),
          },
          connectionMapping: {},
        },
      });
      await recordCreated(s, imported);
      expect.soft(imported.status()).toBe(403);
      expect.soft(await errorOf(imported)).toMatch(/connection/i);

      // None of them left the creator holding a dashboard on the connection.
      expect((await run(NOT_ON_DASHBOARD)).status()).toBe(403);
    });
  });

  test("an editor share still authors new queries on the dashboard's own connection", async ({
    browser,
  }) => {
    await withPrivateConnectionShared(browser, "editor", async (s) => {
      // Authoring: a query on no dashboard runs, then saves onto this one.
      const preview = await s.creator.post("/api/query", {
        data: { connectionId: s.connectionId, query: NOT_ON_DASHBOARD },
      });
      expect(preview.status()).toBe(200);
      const save = await s.creator.put(`/api/dashboards/${s.dashboardId}`, {
        data: { layoutJson: layoutOn(s.connectionId, NOT_ON_DASHBOARD) },
      });
      expect(save.status()).toBe(200);

      // The share covers Alice's dashboard, not a dashboard of the creator's own.
      const ownId = await ownDashboard(s, "editor-own");
      const carry = await s.creator.put(`/api/dashboards/${ownId}`, {
        data: { layoutJson: layoutOn(s.connectionId, NOT_ON_DASHBOARD) },
      });
      expect(carry.status()).toBe(403);
      expect(await errorOf(carry)).toMatch(/connection/i);
    });
  });

  test("a reader holding an editor share runs only the dashboard's queries", async ({
    browser,
  }) => {
    await withPrivateConnectionShared(
      browser,
      "editor",
      async (s) => {
        expect(
          (await runOn(s.creator, s.connectionId, ON_DASHBOARD)).status(),
        ).toBe(200);
        expect(
          (await runOn(s.creator, s.connectionId, NOT_ON_DASHBOARD)).status(),
        ).toBe(403);
        const save = await s.creator.put(`/api/dashboards/${s.dashboardId}`, {
          data: { layoutJson: layoutOn(s.connectionId, NOT_ON_DASHBOARD) },
        });
        expect(save.status()).toBe(403);
      },
      "reader",
    );
  });

  test("making a connection private again binds a creator's dashboard on it to its saved query", async ({
    browser,
  }) => {
    await withScene(browser, async (scene) => {
      const creator = await scene.newUser("creator");
      const connectionId = await scene.newConnection();
      const shared = await scene.alice.patch(
        `/api/connections/${connectionId}`,
        { data: { visibility: "shared" } },
      );
      expect(shared.ok()).toBeTruthy();

      const request = await creator.login();
      const ownId = await dashboardOf(request, scene, "unshared");
      const built = await request.put(`/api/dashboards/${ownId}`, {
        data: { layoutJson: layoutOn(connectionId, ON_DASHBOARD) },
      });
      expect(built.status()).toBe(200);

      const unshared = await scene.alice.patch(
        `/api/connections/${connectionId}`,
        { data: { visibility: "private" } },
      );
      expect(unshared.ok()).toBeTruthy();

      await expectBound(request, ownId, connectionId);
    });
  });

  test("an admin who built on another user's private connection is bound once demoted", async ({
    browser,
  }) => {
    await withScene(browser, async (scene) => {
      const admin = await scene.newUser("admin");
      const connectionId = await scene.newConnection();

      const asAdmin = await admin.login();
      const ownId = await dashboardOf(asAdmin, scene, "demoted");
      const built = await asAdmin.put(`/api/dashboards/${ownId}`, {
        data: { layoutJson: layoutOn(connectionId, ON_DASHBOARD) },
      });
      expect(built.status()).toBe(200);

      const demoted = await scene.alice.patch(`/api/users/${admin.id}`, {
        data: { role: "creator" },
      });
      expect(demoted.status()).toBe(200);

      // A demotion ends the user's sessions, so they sign in again.
      await expectBound(await admin.login(), ownId, connectionId);
    });
  });
});
