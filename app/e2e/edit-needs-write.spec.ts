import { test, expect, ALICE, uid } from "./fixtures";
import { AuthPage } from "./pages/auth";

/**
 * A creator whose write permission is off gets no Edit anywhere: not on their
 * own dashboard, not on one shared with them as editor, not by typing the edit
 * URL, and not on the list (#2313). Every row is created under a unique name
 * and deleted by id.
 */
test.describe("Editing needs write permission", () => {
  test("a creator with write off cannot reach edit mode or the list's write actions", async ({
    page,
    authPage,
    browser,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const suffix = uid();
    const email = `edit-nowrite-${suffix}@example.com`;
    const password = "password123";
    const ownName = `edit-own-${suffix}`;
    const sharedName = `edit-shared-${suffix}`;
    let userId = "";
    let ownId = "";
    let sharedId = "";
    let templateId = "";
    const firstCtx = await browser.newContext();
    const userCtx = await browser.newContext();

    try {
      const user = await page.request.post("/api/users", {
        data: {
          name: `Edit no-write ${suffix}`,
          email,
          password,
          role: "creator",
          canWrite: true,
        },
      });
      expect(user.status()).toBe(201);
      userId = (await user.json()).data.id as string;

      // Alice owns a dashboard and shares it with the creator as editor.
      const shared = await page.request.post("/api/dashboards", {
        data: { name: sharedName },
      });
      expect(shared.ok()).toBeTruthy();
      sharedId = (await shared.json()).data.id as string;
      const share = await page.request.post(
        `/api/dashboards/${sharedId}/share`,
        { data: { email, role: "editor" } },
      );
      expect(share.ok()).toBeTruthy();

      // While write is on, the creator makes their own dashboard.
      const first = await firstCtx.newPage();
      await new AuthPage(first).login(email, password);
      const own = await first.request.post("/api/dashboards", {
        data: { name: ownName },
      });
      expect(own.ok()).toBeTruthy();
      ownId = (await own.json()).data.id as string;

      const off = await page.request.patch(`/api/users/${userId}`, {
        data: { canWrite: false },
      });
      expect(off.ok()).toBeTruthy();

      // A fresh sign-in carries the new flag.
      const u = await userCtx.newPage();
      await new AuthPage(u).login(email, password);

      for (const [id, name] of [
        [ownId, ownName],
        [sharedId, sharedName],
      ]) {
        await u.goto(`/${id}`);
        await expect(u.getByRole("heading", { name })).toBeVisible();
        await expect(
          u.getByRole("button", { name: "Edit", exact: true }),
        ).toHaveCount(0);

        await u.goto(`/${id}/edit`);
        await expect(u).toHaveURL(new RegExp(`/${id}$`));
        await expect(u.getByRole("heading", { name })).toBeVisible();
      }

      await u.goto("/");
      await expect(u.getByText(ownName, { exact: true })).toBeVisible();
      await expect(
        u.getByRole("button", { name: "New dashboard", exact: true }),
      ).toHaveCount(0);
      await expect(
        u.getByRole("button", { name: "Import", exact: true }),
      ).toHaveCount(0);
      // The row menu stays, holding only Export (viewer-level, #979).
      await u
        .getByRole("button", { name: `Dashboard options for ${ownName}` })
        .click();
      await expect(u.getByRole("menuitem", { name: "Export" })).toBeVisible();
      await expect(u.getByRole("menuitem")).toHaveCount(1);
      await u.keyboard.press("Escape");

      // The widget library and API keys offer no create control either.
      const tplName = `edit-tpl-${suffix}`;
      const tpl = await page.request.post("/api/widget-templates", {
        data: {
          name: tplName,
          chartType: "table",
          connectorType: "neo4j",
          query: "MATCH (m:Movie) RETURN m.title LIMIT 5",
        },
      });
      expect(tpl.ok()).toBeTruthy();
      templateId = (await tpl.json()).data.id;
      await u.goto("/widget-library");
      await expect(
        u.getByRole("heading", { name: "Widget Library" }),
      ).toBeVisible();
      // The row is there, but Duplicate and Use in Dashboard (both refused
      // or dead ends without write) are not: the menu is gone entirely.
      await expect(u.getByText(tplName, { exact: true })).toBeVisible();
      await expect(
        u.getByRole("button", { name: `Template actions for ${tplName}` }),
      ).toHaveCount(0);
      await expect(
        u.getByRole("button", { name: "New template", exact: true }),
      ).toHaveCount(0);
      await u.goto("/settings/api-keys");
      await expect(u.getByRole("heading", { name: "API keys" })).toBeVisible();
      await expect(
        u.getByText("Your account can't create API keys."),
      ).toBeVisible();
      await expect(
        u.getByRole("button", { name: "Create API key", exact: true }),
      ).toHaveCount(0);
    } finally {
      if (ownId) await page.request.delete(`/api/dashboards/${ownId}`);
      if (sharedId) await page.request.delete(`/api/dashboards/${sharedId}`);
      if (templateId)
        await page.request.delete(`/api/widget-templates/${templateId}`);
      if (userId) await page.request.delete(`/api/users/${userId}`);
      await firstCtx.close();
      await userCtx.close();
    }
  });
});
