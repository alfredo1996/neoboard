import {
  test,
  expect,
  ALICE,
  TEST_NEO4J_BOLT_URL,
  createTestDashboard,
  uid,
} from "./fixtures";
import { AuthPage } from "./pages/auth";
import type { Page } from "@playwright/test";

/**
 * A viewer share may run only the dashboard's saved queries (#972), and no
 * dashboard saves the neighbour query behind Expand, so the viewer's node menu
 * must not offer it (#1828). The owner's still does.
 */

/** Right-click the one node until its menu offers Properties, return the menu. */
async function openNodeMenu(page: Page) {
  const canvas = page
    .getByTestId("graph-exploration")
    .locator("canvas")
    .first();
  const menu = page.getByTestId("graph-context-menu");
  await expect(async () => {
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await canvas.click({
      button: "right",
      position: { x: box!.width / 2, y: box!.height / 2 },
      force: true,
    });
    await expect(
      menu.getByRole("button", { name: "Properties", exact: true }),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  return menu;
}

test.describe("Graph node menu by access level (#1828)", () => {
  test.describe.configure({ timeout: 90_000 });

  test("a viewer is not offered Expand, the owner is", async ({ browser }) => {
    const suffix = uid();
    const aliceCtx = await browser.newContext();
    const alice = await aliceCtx.newPage();
    let userId: string | undefined;
    let connectionId: string | undefined;
    let dashboardId: string | undefined;
    try {
      await new AuthPage(alice).login(ALICE.email, ALICE.password);
      const email = `graph-viewer-${suffix}@example.com`;
      const password = "password123";
      const userRes = await alice.request.post("/api/users", {
        data: {
          name: `Graph viewer ${suffix}`,
          email,
          password,
          role: "creator",
        },
      });
      expect(userRes.status()).toBe(201);
      userId = (await userRes.json()).data.id;

      const connRes = await alice.request.post("/api/connections", {
        data: {
          name: `graph-viewer-${suffix}`,
          type: "neo4j",
          config: {
            uri: TEST_NEO4J_BOLT_URL,
            username: "neo4j",
            password: "neoboard123",
          },
        },
      });
      expect(connRes.status()).toBe(201);
      connectionId = (await connRes.json()).data.id as string;

      ({ id: dashboardId } = await createTestDashboard(
        alice.request,
        `graph-viewer-${suffix}`,
      ));
      const put = await alice.request.put(`/api/dashboards/${dashboardId}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              {
                id: "p1",
                title: "Page 1",
                widgets: [
                  {
                    id: "w-graph",
                    chartType: "graph",
                    connectionId,
                    query: "MATCH (p:Person) RETURN p LIMIT 1",
                    settings: { title: "One person" },
                  },
                ],
                gridLayout: [{ i: "w-graph", x: 0, y: 0, w: 12, h: 8 }],
              },
            ],
          },
        },
      });
      expect(put.ok()).toBeTruthy();
      const share = await alice.request.post(
        `/api/dashboards/${dashboardId}/share`,
        { data: { email, role: "viewer" } },
      );
      expect(share.ok()).toBeTruthy();

      // The owner's menu offers Expand.
      await alice.goto(`/${dashboardId}`);
      const ownerMenu = await openNodeMenu(alice);
      await expect(
        ownerMenu.getByRole("button", { name: "Expand", exact: true }),
      ).toBeVisible();

      // The viewer's menu has the node's Properties and no Expand.
      const viewerCtx = await browser.newContext();
      try {
        const viewer = await viewerCtx.newPage();
        await new AuthPage(viewer).login(email, password);
        await viewer.goto(`/${dashboardId}`);
        const viewerMenu = await openNodeMenu(viewer);
        await expect(
          viewerMenu.getByRole("button", { name: "Expand", exact: true }),
        ).toHaveCount(0);
      } finally {
        await viewerCtx.close();
      }
    } finally {
      if (dashboardId)
        await alice.request.delete(`/api/dashboards/${dashboardId}`);
      if (connectionId)
        await alice.request.delete(
          `/api/connections/${connectionId}?force=true`,
        );
      if (userId) await alice.request.delete(`/api/users/${userId}`);
      await aliceCtx.close();
    }
  });
});
