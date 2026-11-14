import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  typeInEditor,
  uid,
} from "./fixtures";

/**
 * #2481 — behind a proxy that refuses request bodies over 8 KB (AWS WAF's
 * managed Core rule set), the editor preview of a long draft failed: a draft
 * has no saved copy to name, so its text travels in the body. The body is now
 * gzipped. `page.route` plays the proxy.
 */
test.describe("The editor preview of a long draft runs behind a body-size cap (#2481)", () => {
  test("a 12 KB draft previews through a proxy that refuses bodies over 8 KB", async ({
    page,
    authPage,
  }) => {
    test.setTimeout(90_000);
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Long draft ${uid()}`,
    );

    try {
      const sent: { size: number; encoding: string | undefined }[] = [];
      await page.route("**/api/query", async (route) => {
        const req = route.request();
        const size = req.postDataBuffer()?.length ?? 0;
        sent.push({ size, encoding: req.headers()["content-encoding"] });
        if (size > 8192) {
          await route.fulfill({ status: 403, body: "Forbidden by proxy" });
          return;
        }
        await route.continue();
      });

      await page.goto(`/${id}/edit`);
      await page
        .getByRole("button", { name: "Add Widget", exact: true })
        .first()
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Add Widget",
        exact: true,
      });
      await dialog
        .getByRole("combobox", { name: "Chart Type", exact: true })
        .click();
      await page
        .getByRole("option", { name: "Data Table", exact: true })
        .click();
      await dialog
        .getByRole("combobox", { name: "Connection", exact: true })
        .click();
      await page.getByRole("option").first().click();

      const padding = "x".repeat(12_000);
      await typeInEditor(
        dialog,
        page,
        `/* ${padding} */ MATCH (m:Movie) RETURN m.title AS title LIMIT 3`,
      );
      const run = dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)");
      await expect(run).toBeEnabled({ timeout: 10_000 });
      await run.click();

      await expect(dialog.locator("table").first()).toBeVisible({
        timeout: 30_000,
      });
      const long = sent.filter((s) => s.encoding === "gzip");
      expect(long.length).toBeGreaterThan(0);
      expect(Math.max(...sent.map((s) => s.size))).toBeLessThanOrEqual(8192);
    } finally {
      await cleanup();
    }
  });
});
