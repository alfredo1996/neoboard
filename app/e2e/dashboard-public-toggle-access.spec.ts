import { test, expect, ALICE, createTestDashboard } from "./fixtures";
import { AuthPage } from "./pages/auth";

/**
 * Only a dashboard's owner or an admin can make it public or private, the same
 * rule as managing its shares. An editor share can still save it. Every row is
 * created under a unique name and deleted by id.
 */
test.describe("Only a dashboard's owner or an admin can make it public", () => {
  test("an editor share cannot make Alice's dashboard public, and it stays private", async ({
    page,
    authPage,
    browser,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const email = `public-toggle-editor-${suffix}@example.com`;
    const password = "password123";
    let userId = "";
    let dashboardId = "";
    const context = await browser.newContext();

    /** The dashboard as Alice reads it. */
    const stored = async () =>
      (await (await page.request.get(`/api/dashboards/${dashboardId}`)).json())
        .data;

    try {
      ({ id: dashboardId } = await createTestDashboard(
        page.request,
        `public-toggle-${suffix}`,
      ));
      const user = await page.request.post("/api/users", {
        data: {
          name: `Public toggle editor ${suffix}`,
          email,
          password,
          role: "creator",
          canWrite: true,
        },
      });
      expect(user.status()).toBe(201);
      userId = (await user.json()).data.id as string;
      const share = await page.request.post(
        `/api/dashboards/${dashboardId}/share`,
        { data: { email, role: "editor" } },
      );
      expect(share.ok()).toBeTruthy();

      const editorPage = await context.newPage();
      await new AuthPage(editorPage).login(email, password);

      const made = await editorPage.request.put(
        `/api/dashboards/${dashboardId}`,
        { data: { isPublic: true } },
      );
      expect(made.status()).toBe(403);
      expect((await made.json()).error.message).toBe(
        "Only the dashboard's owner or an admin can change who can open it",
      );
      expect((await stored()).isPublic).toBe(false);

      const renamed = await editorPage.request.put(
        `/api/dashboards/${dashboardId}`,
        { data: { name: `public-toggle-renamed-${suffix}` } },
      );
      expect(renamed.status()).toBe(200);
      const after = await stored();
      expect(after.name).toBe(`public-toggle-renamed-${suffix}`);
      expect(after.isPublic).toBe(false);
    } finally {
      if (dashboardId)
        await page.request.delete(`/api/dashboards/${dashboardId}`);
      if (userId) await page.request.delete(`/api/users/${userId}`);
      await context.close();
    }
  });
});
