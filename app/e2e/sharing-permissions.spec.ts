import {
  test,
  expect,
  ALICE,
  BOB,
  CAROL,
  DAVE,
  createTestDashboard,
} from "./fixtures";
import type { Browser, Page } from "@playwright/test";

/**
 * Covers issue #477 — dashboard sharing CRUD + full permission matrix.
 *
 * Note: the "Sharing" button in the edit toolbar is currently gated on
 * `isAdmin` (app/src/app/(dashboard)/[id]/edit/page.tsx), so UI-driven share
 * tests use Alice (admin) as the sharer. The API layer (requireShareAccess)
 * also allows the owner, but since the UI doesn't expose that path we only
 * exercise the admin flow here.
 */

/**
 * Login with automatic retry on the "submitted before hydration" race.
 *
 * The /login form uses a client `onSubmit` handler. If the Sign-in button is
 * clicked before React 19 has hydrated and attached the handler, the form
 * falls back to its default HTML behavior (GET to /login with query params),
 * which leaves the browser on `/login?email=...` instead of navigating to `/`.
 * AuthPage.login does not guard against this, so we retry up to 3 times.
 */
async function robustLogin(page: Page, email: string, password: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email").waitFor({ state: "visible" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    try {
      await page.waitForURL("/", { timeout: 10_000 });
      return;
    } catch {
      if (attempt === 3) {
        throw new Error(
          `robustLogin: failed to reach / after 3 attempts (last URL: ${page.url()})`,
        );
      }
    }
  }
}

async function loginAs(
  browser: Browser,
  email: string,
  password: string,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await robustLogin(page, email, password);
  return { page, close: () => context.close() };
}

async function setupAliceDashboard(page: Page, name: string) {
  await robustLogin(page, ALICE.email, ALICE.password);
  return createTestDashboard(page.request, name);
}

async function openSharingPanel(page: Page, dashboardId: string) {
  await page.goto(`/${dashboardId}/edit`);
  await page.waitForURL(/\/edit/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Sharing" }).click();
  await expect(page.getByText("People")).toBeVisible({ timeout: 10_000 });
}

test.describe("Dashboard sharing — CRUD + permission matrix", () => {
  // robustLogin may retry up to 3 times when the login form submits before
  // React hydration, so an unlucky run can spend 10–20s on login alone.
  // Combined with multi-context tests and per-test cleanup, the default 30s
  // is too tight. 60s gives enough headroom without masking real regressions.
  test.describe.configure({ timeout: 60_000 });

  test("1. share dashboard with user as viewer (happy path)", async ({
    page,
  }) => {
    const { id, cleanup } = await setupAliceDashboard(
      page,
      `Share Test 1 ${Date.now()}`,
    );
    try {
      await openSharingPanel(page, id);
      await page.locator("#assign-email").fill(DAVE.email);
      // Default role is "viewer", no need to change it
      await page.getByRole("button", { name: "Assign" }).click();

      await expect(page.getByText("Dave Demo")).toBeVisible({ timeout: 5_000 });
      await expect(
        page.locator(`[aria-label="Remove ${DAVE.email}"]`),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test("2. share dashboard with user as editor", async ({ page }) => {
    const { id, cleanup } = await setupAliceDashboard(
      page,
      `Share Test 2 ${Date.now()}`,
    );
    try {
      await openSharingPanel(page, id);
      await page.locator("#assign-email").fill(DAVE.email);
      await page.locator("#assign-role").click();
      await page.getByRole("option", { name: "Editor" }).click();
      await page.getByRole("button", { name: "Assign" }).click();

      await expect(page.getByText("Dave Demo")).toBeVisible({ timeout: 5_000 });
      // Role label is rendered with a `capitalize` class; the raw text is "editor".
      await expect(page.getByText("editor", { exact: true })).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test("3. update existing share role without duplicating the row", async ({
    page,
  }) => {
    const { id, cleanup } = await setupAliceDashboard(
      page,
      `Share Test 3 ${Date.now()}`,
    );
    try {
      // Seed viewer share via API
      const seedRes = await page.request.post(`/api/dashboards/${id}/share`, {
        data: { email: DAVE.email, role: "viewer" },
      });
      expect(seedRes.status()).toBe(201);

      await openSharingPanel(page, id);
      await expect(page.getByText("viewer", { exact: true })).toBeVisible();

      // Upsert to editor via UI
      await page.locator("#assign-email").fill(DAVE.email);
      await page.locator("#assign-role").click();
      await page.getByRole("option", { name: "Editor" }).click();
      await page.getByRole("button", { name: "Assign" }).click();

      await expect(page.getByText("editor", { exact: true })).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByText("viewer", { exact: true })).not.toBeVisible();
      await expect(page.getByText("Dave Demo")).toHaveCount(1);
    } finally {
      await cleanup();
    }
  });

  test("4. revoke share removes user from the list", async ({ page }) => {
    const { id, cleanup } = await setupAliceDashboard(
      page,
      `Share Test 4 ${Date.now()}`,
    );
    try {
      await page.request.post(`/api/dashboards/${id}/share`, {
        data: { email: DAVE.email, role: "viewer" },
      });

      await openSharingPanel(page, id);
      await expect(page.getByText("Dave Demo")).toBeVisible();

      await page.locator(`[aria-label="Remove ${DAVE.email}"]`).click();
      await expect(page.getByText("Dave Demo")).not.toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByText("No users assigned yet.")).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test("5. share with non-existent email shows error", async ({ page }) => {
    const { id, cleanup } = await setupAliceDashboard(
      page,
      `Share Test 5 ${Date.now()}`,
    );
    try {
      await openSharingPanel(page, id);
      await page.locator("#assign-email").fill("ghost@example.com");
      await page.getByRole("button", { name: "Assign" }).click();

      await expect(page.getByText(/user not found/i)).toBeVisible({
        timeout: 5_000,
      });
    } finally {
      await cleanup();
    }
  });

  test("6. share with self shows error", async ({ page }) => {
    const { id, cleanup } = await setupAliceDashboard(
      page,
      `Share Test 6 ${Date.now()}`,
    );
    try {
      await openSharingPanel(page, id);
      await page.locator("#assign-email").fill(ALICE.email);
      await page.getByRole("button", { name: "Assign" }).click();

      await expect(page.getByText(/cannot share with yourself/i)).toBeVisible({
        timeout: 5_000,
      });
    } finally {
      await cleanup();
    }
  });

  test("7. recipient sees shared dashboard in their list", async ({
    page,
    browser,
  }) => {
    const name = `Share Test 7 ${Date.now()}`;
    const { id, cleanup } = await setupAliceDashboard(page, name);
    try {
      await page.request.post(`/api/dashboards/${id}/share`, {
        data: { email: DAVE.email, role: "viewer" },
      });

      const dave = await loginAs(browser, DAVE.email, DAVE.password);
      try {
        await expect(dave.page.getByText(name)).toBeVisible({
          timeout: 10_000,
        });
      } finally {
        await dave.close();
      }
    } finally {
      await cleanup();
    }
  });

  test("8. viewer cannot edit: Edit button hidden and direct PUT returns 404", async ({
    page,
    browser,
  }) => {
    const { id, cleanup } = await setupAliceDashboard(
      page,
      `Share Test 8 ${Date.now()}`,
    );
    try {
      await page.request.post(`/api/dashboards/${id}/share`, {
        data: { email: DAVE.email, role: "viewer" },
      });

      const dave = await loginAs(browser, DAVE.email, DAVE.password);
      try {
        await dave.page.goto(`/${id}`);
        await expect(
          dave.page.getByRole("button", { name: "Edit", exact: true }),
        ).not.toBeVisible();

        // Direct API: PUT returns 404 for non-editor (defence-in-depth:
        // don't leak existence of dashboards the caller can't edit).
        const putRes = await dave.page.request.put(`/api/dashboards/${id}`, {
          data: { name: "Hijacked" },
        });
        expect(putRes.status()).toBe(404);
      } finally {
        await dave.close();
      }
    } finally {
      await cleanup();
    }
  });

  test("9. editor can edit widgets but cannot delete the dashboard", async ({
    page,
    browser,
  }) => {
    const name = `Share Test 9 ${Date.now()}`;
    const { id, cleanup } = await setupAliceDashboard(page, name);
    try {
      await page.request.post(`/api/dashboards/${id}/share`, {
        data: { email: DAVE.email, role: "editor" },
      });

      const dave = await loginAs(browser, DAVE.email, DAVE.password);
      try {
        // Editor PUT (rename) succeeds.
        const putRes = await dave.page.request.put(`/api/dashboards/${id}`, {
          data: { name: `${name} — edited` },
        });
        expect(putRes.status()).toBe(200);

        // Editor DELETE fails — only the owner (or admin) can delete.
        // The route returns 404 rather than 403 to avoid leaking existence.
        const delRes = await dave.page.request.delete(`/api/dashboards/${id}`);
        expect(delRes.status()).toBe(404);
      } finally {
        await dave.close();
      }
    } finally {
      await cleanup();
    }
  });

  test("10. admin bypasses per-dashboard ACL on dashboards owned by others", async ({
    page,
    browser,
  }) => {
    // Bob owns the dashboard — Alice (admin) should still be able to read
    // and modify it without any explicit share.
    await robustLogin(page, BOB.email, BOB.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Share Test 10 ${Date.now()}`,
    );
    try {
      const alice = await loginAs(browser, ALICE.email, ALICE.password);
      try {
        const getRes = await alice.page.request.get(`/api/dashboards/${id}`);
        expect(getRes.status()).toBe(200);
        const body = await getRes.json();
        expect(body.data.role).toBe("admin");

        const putRes = await alice.page.request.put(`/api/dashboards/${id}`, {
          data: { name: "Admin Bypass Rename" },
        });
        expect(putRes.status()).toBe(200);
      } finally {
        await alice.close();
      }
    } finally {
      await cleanup();
    }
  });

  test("11. reader cannot create dashboards (UI hidden + API returns 403)", async ({
    page,
  }) => {
    await robustLogin(page, CAROL.email, CAROL.password);

    // UI: "New Dashboard" CTA is gated on canCreate (admin|creator),
    // so readers do not see it at all.
    await expect(
      page.getByRole("button", { name: /new dashboard/i }),
    ).not.toBeVisible();

    // API: direct POST is blocked by the canWrite check.
    const res = await page.request.post("/api/dashboards", {
      data: { name: "Reader Attempt" },
    });
    expect(res.status()).toBe(403);
  });
});
