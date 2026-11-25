import { test, expect, ALICE, BOB } from "./fixtures";

/**
 * Settings → System (#2416). Registration is deployment-wide and the suite's
 * other specs sign people up, so this file runs alone, after them (the
 * `serial` project in playwright.config.ts), and puts the setting back in a
 * `finally`.
 */
test.describe.configure({ mode: "serial" });

test.describe("Settings — System", () => {
  test("an admin closes and opens sign-up, and /signup follows at once", async ({
    page,
    browser,
    authPage,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    try {
      await page.goto("/settings/system");
      const form = page.getByRole("form", { name: "Sign-up", exact: true });
      const toggle = form.getByRole("switch");
      await expect(toggle).toBeChecked(); // global-setup opens it through env

      const save = async () => {
        const done = page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/settings") && r.request().method() === "PUT",
        );
        await form.getByRole("button", { name: "Save", exact: true }).click();
        expect((await done).ok()).toBe(true);
      };
      await toggle.click();
      await save();
      await expect(form.getByText("Set here", { exact: true })).toBeVisible();

      const visitor = await browser.newContext();
      const signup = await visitor.newPage();
      await signup.goto("/signup");
      await expect(
        signup.getByText("Registration is disabled", { exact: true }),
      ).toBeVisible();

      await toggle.click();
      await save();
      await signup.reload();
      await expect(
        signup.getByRole("button", { name: "Create account", exact: true }),
      ).toBeVisible();
      await visitor.close();
    } finally {
      const res = await page.request.put("/api/settings", {
        data: { changes: { REGISTRATION_ENABLED: null } },
      });
      expect(res.ok()).toBe(true);
    }
  });

  test("a creator sees no System tab", async ({
    page,
    authPage,
    sidebarPage,
  }) => {
    await authPage.login(BOB.email, BOB.password);
    await sidebarPage.navigateTo("Settings");
    const tabs = page.getByRole("navigation", {
      name: "Settings",
      exact: true,
    });
    await expect(
      tabs.getByRole("link", { name: "Profile", exact: true }),
    ).toBeVisible();
    await expect(
      tabs.getByRole("link", { name: "System", exact: true }),
    ).toHaveCount(0);
    const res = await page.request.get("/api/settings");
    expect(res.status()).toBe(403);
  });
});
