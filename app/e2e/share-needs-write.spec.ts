import { test, expect, ALICE, BOB, uid } from "./fixtures";
import { AuthPage } from "./pages/auth";

/**
 * A creator whose write permission was turned off keeps their dashboard but
 * can no longer manage its shares (#2304). Every row is created under a unique
 * name and deleted by id.
 */
test.describe("Sharing needs write permission", () => {
  test("a creator with write off sees no Share action and a direct POST is refused", async ({
    page,
    authPage,
    browser,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const suffix = uid();
    const email = `share-nowrite-${suffix}@example.com`;
    const password = "password123";
    let userId = "";
    let dashboardId = "";
    const writerCtx = await browser.newContext();

    try {
      const user = await page.request.post("/api/users", {
        data: {
          name: `Share no-write ${suffix}`,
          email,
          password,
          role: "creator",
          canWrite: true,
        },
      });
      expect(user.status()).toBe(201);
      userId = (await user.json()).data.id as string;

      // While write is on, the creator creates their dashboard.
      const writerPage = await writerCtx.newPage();
      await new AuthPage(writerPage).login(email, password);
      const made = await writerPage.request.post("/api/dashboards", {
        data: { name: `share-nowrite-${suffix}` },
      });
      expect(made.ok()).toBeTruthy();
      dashboardId = (await made.json()).data.id as string;

      const off = await page.request.patch(`/api/users/${userId}`, {
        data: { canWrite: false },
      });
      expect(off.ok()).toBeTruthy();

      const ownerPage = writerPage;
      await ownerPage.goto(`/${dashboardId}`);
      await expect(
        ownerPage.getByRole("heading", { name: `share-nowrite-${suffix}` }),
      ).toBeVisible();
      // Documents the owner's rule; passes before the fix too, the Share sheet is admin-only.
      await expect(
        ownerPage.getByRole("button", { name: "Share", exact: true }),
      ).toHaveCount(0);

      const res = await ownerPage.request.post(
        `/api/dashboards/${dashboardId}/share`,
        { data: { email: BOB.email, role: "viewer" } },
      );
      expect(res.status()).toBe(403);
      expect((await res.json()).error.message).toBe(
        "Write permission required",
      );

      // Nothing was written.
      const shares = await page.request.get(
        `/api/dashboards/${dashboardId}/share`,
      );
      expect((await shares.json()).data).toEqual([]);
    } finally {
      if (dashboardId)
        await page.request.delete(`/api/dashboards/${dashboardId}`);
      if (userId) await page.request.delete(`/api/users/${userId}`);
      await writerCtx.close();
    }
  });
});
