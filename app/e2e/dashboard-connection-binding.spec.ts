import {
  test,
  expect,
  ALICE,
  TEST_NEO4J_BOLT_URL,
  createTestDashboard,
} from "./fixtures";
import { AuthPage } from "./pages/auth";
import type { APIRequestContext, APIResponse, Browser } from "@playwright/test";

/**
 * A viewer share runs only the queries its dashboard contains (#972). Owning
 * or editing a dashboard that names a connection is what lifts that limit, so
 * no write may leave a caller holding such a dashboard on a connection they
 * cannot use directly (#1816). Alice's connection is private and every row
 * here is created under a unique name, so the creator's only claim on it is
 * the share.
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

interface Shared {
  creator: APIRequestContext;
  connectionId: string;
  dashboardId: string;
  suffix: string;
  /** Dashboards the creator ends up owning, deleted by id afterwards. */
  created: string[];
}

async function withPrivateConnectionShared(
  browser: Browser,
  role: "viewer" | "editor",
  fn: (s: Shared) => Promise<void>,
) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const created: string[] = [];
  const aliceCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  let userId: string | undefined;
  let connectionId: string | undefined;
  let dashboardId: string | undefined;
  try {
    await new AuthPage(alice).login(ALICE.email, ALICE.password);
    const email = `binding-${suffix}@example.com`;
    const password = "password123";
    const userRes = await alice.request.post("/api/users", {
      data: { name: `Binding ${suffix}`, email, password, role: "creator" },
    });
    expect(userRes.status()).toBe(201);
    userId = (await userRes.json()).data.id as string;

    const connRes = await alice.request.post("/api/connections", {
      data: {
        name: `binding-${suffix}`,
        type: "neo4j",
        config: {
          uri: TEST_NEO4J_BOLT_URL,
          username: "neo4j",
          password: "neoboard123",
          // The server keeps one driver per distinct connection config, and
          // deleting any connection closes the driver for its config. A unique
          // timeout keeps this test's driver apart from every other connection
          // to the same database, so a cleanup elsewhere cannot close it
          // mid-query.
          connectionTimeout: 20_000 + Math.floor(Math.random() * 280_000),
        },
      },
    });
    expect(connRes.status()).toBe(201);
    connectionId = (await connRes.json()).data.id as string;

    ({ id: dashboardId } = await createTestDashboard(
      alice.request,
      `binding-${suffix}`,
    ));
    const put = await alice.request.put(`/api/dashboards/${dashboardId}`, {
      data: { layoutJson: layoutOn(connectionId, ON_DASHBOARD) },
    });
    expect(put.status()).toBe(200);
    const share = await alice.request.post(
      `/api/dashboards/${dashboardId}/share`,
      { data: { email, role } },
    );
    expect(share.status()).toBe(201);

    const creatorCtx = await browser.newContext();
    try {
      const page = await creatorCtx.newPage();
      await new AuthPage(page).login(email, password);
      await fn({
        creator: page.request,
        connectionId,
        dashboardId,
        suffix,
        created,
      });
    } finally {
      await creatorCtx.close();
    }
  } finally {
    for (const id of created) {
      await alice.request.delete(`/api/dashboards/${id}`);
    }
    if (dashboardId)
      await alice.request.delete(`/api/dashboards/${dashboardId}`);
    if (connectionId)
      await alice.request.delete(`/api/connections/${connectionId}?force=true`);
    if (userId) await alice.request.delete(`/api/users/${userId}`);
    await aliceCtx.close();
  }
}

/** The creator's own empty dashboard, recorded for cleanup at once. */
async function ownDashboard(s: Shared, label: string): Promise<string> {
  const res = await s.creator.post("/api/dashboards", {
    data: { name: `binding-${label}-${s.suffix}` },
  });
  expect(res.status()).toBe(201);
  const id = (await res.json()).data.id as string;
  s.created.push(id);
  return id;
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
});
