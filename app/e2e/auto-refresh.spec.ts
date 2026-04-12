import { test, expect, ALICE, createTestDashboard } from "./fixtures";

// Serial: both tests mutate the same seeded "Movie Analytics" dashboard.
// Running in parallel causes one test to see the other's interval setting.
test.describe.serial("Auto-refresh", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("should enable auto-refresh and persist setting after reload", async ({
    page,
  }) => {
    // Navigate to the "Movie Analytics" dashboard (seeded)
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();

    // Open auto-refresh dropdown — wait for it to be fully interactive
    const refreshButton = page.getByTestId("auto-refresh-trigger");
    await expect(refreshButton).toBeVisible({ timeout: 10_000 });
    await refreshButton.click();

    // Wait for the PUT request to complete before reloading — avoids
    // the race where reload fires before the mutation commits to the DB.
    const putResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/dashboards/") &&
        resp.request().method() === "PUT",
    );
    await page.getByRole("menuitemradio", { name: "30 seconds" }).click();
    await putResponse;

    // Verify the button now shows "30s" (followed by countdown)
    await expect(page.getByTestId("auto-refresh-trigger")).toContainText(
      "30s",
      { timeout: 5_000 },
    );

    // Reload and verify the setting persisted from the DB
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("auto-refresh-trigger")).toContainText(
      "30s",
      { timeout: 10_000 },
    );

    // Disable auto-refresh to clean up
    await page.getByTestId("auto-refresh-trigger").click();
    await page.getByRole("menuitemradio", { name: "Off" }).click();
    await expect(page.getByTestId("auto-refresh-trigger")).toContainText(
      "Auto-refresh",
    );
  });

  test("should accept a custom interval and trigger a refresh", async ({
    page,
  }) => {
    // Navigate to the "Movie Analytics" dashboard (seeded)
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();

    // Open auto-refresh dropdown and set a 5-second custom interval.
    // The dropdown closes automatically after clicking "Set" (controlled state).
    await page.getByTestId("auto-refresh-trigger").click();
    await page.getByTestId("custom-interval-input").fill("5");
    await page.getByTestId("custom-interval-apply").click();

    // Button should show "5s" + countdown; dropdown should be closed
    await expect(page.getByTestId("auto-refresh-trigger")).toContainText("5s", {
      timeout: 5_000,
    });

    // Wait for the auto-refresh to trigger at least one query cycle
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/query") && resp.request().method() === "POST",
      { timeout: 10_000 },
    );
    await expect(page.getByTestId("auto-refresh-trigger")).toContainText("5s");
    // No widget should be stuck on a loading skeleton after the refresh
    await expect(page.locator("[data-loading='true']")).toHaveCount(0, {
      timeout: 3_000,
    });

    // Clean up — disable (dropdown is closed, so trigger click opens it cleanly)
    await page.getByTestId("auto-refresh-trigger").click();
    await page.getByRole("menuitemradio", { name: "Off" }).click();
    await expect(page.getByTestId("auto-refresh-trigger")).toContainText(
      "Auto-refresh",
    );
  });
});

test.describe("Manual refresh and disable auto-refresh", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("manual per-widget refresh button triggers re-fetch", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Create dashboard with a widget that has showRefreshButton enabled
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Refresh Test ${Date.now()}`,
    );
    try {
      // Update the dashboard with a widget + showRefreshButton
      await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              {
                id: "p1",
                title: "Page 1",
                widgets: [
                  {
                    id: "w1",
                    chartType: "table",
                    connectionId: "conn-neo4j-001",
                    query: "MATCH (m:Movie) RETURN m.title AS title LIMIT 5",
                    settings: {
                      title: "Movies",
                      chartOptions: { showRefreshButton: true },
                    },
                  },
                ],
                gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 4 }],
              },
            ],
          },
        },
      });

      // Navigate to the dashboard in view mode
      await page.goto(`/${id}`);
      await expect(page.locator("[data-testid='widget-card']")).toBeVisible({
        timeout: 15_000,
      });

      // Wait for initial query to finish
      await expect(page.locator("table")).toBeVisible({ timeout: 15_000 });

      // Click the per-widget refresh button and verify a query fires
      const queryRequest = page.waitForRequest(
        (req) => req.url().includes("/api/query") && req.method() === "POST",
      );
      await page
        .locator("[data-testid='widget-card']")
        .getByRole("button", { name: "Refresh" })
        .click();
      await queryRequest;

      // Table should still be visible (no crash)
      await expect(page.locator("table")).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanup();
    }
  });

  test("disabling auto-refresh stops background polling", async ({ page }) => {
    test.setTimeout(30_000);

    // Navigate to Movie Analytics
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();

    // Enable 5s custom interval
    await page.getByTestId("auto-refresh-trigger").click();
    await page.getByTestId("custom-interval-input").fill("5");
    await page.getByTestId("custom-interval-apply").click();
    await expect(page.getByTestId("auto-refresh-trigger")).toContainText("5s", {
      timeout: 5_000,
    });

    // Wait for at least one auto-refresh query to confirm polling is active
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/query") && resp.request().method() === "POST",
      { timeout: 10_000 },
    );

    // Disable auto-refresh
    await page.getByTestId("auto-refresh-trigger").click();
    const putDone = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/dashboards/") &&
        resp.request().method() === "PUT",
    );
    await page.getByRole("menuitemradio", { name: "Off" }).click();
    await putDone;
    await expect(page.getByTestId("auto-refresh-trigger")).toContainText(
      "Auto-refresh",
    );

    // Count query requests over 7 seconds — should be zero
    let queryCount = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/query") && req.method() === "POST") {
        queryCount++;
      }
    });
    await page.waitForTimeout(7_000);
    expect(queryCount).toBe(0);
  });

  test("manual refresh works when auto-refresh is disabled", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Create dashboard with showRefreshButton and no auto-refresh
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Manual Only ${Date.now()}`,
    );
    try {
      await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              {
                id: "p1",
                title: "Page 1",
                widgets: [
                  {
                    id: "w1",
                    chartType: "table",
                    connectionId: "conn-neo4j-001",
                    query: "MATCH (m:Movie) RETURN m.title AS title LIMIT 5",
                    settings: {
                      title: "Movies",
                      chartOptions: { showRefreshButton: true },
                    },
                  },
                ],
                gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 4 }],
              },
            ],
          },
        },
      });

      await page.goto(`/${id}`);
      await expect(page.locator("table")).toBeVisible({ timeout: 15_000 });

      // Auto-refresh should be off (default) — button should say "Auto-refresh"
      await expect(page.getByTestId("auto-refresh-trigger")).toContainText(
        "Auto-refresh",
      );

      // Click manual refresh and verify query fires
      const queryRequest = page.waitForRequest(
        (req) => req.url().includes("/api/query") && req.method() === "POST",
      );
      await page
        .locator("[data-testid='widget-card']")
        .getByRole("button", { name: "Refresh" })
        .click();
      await queryRequest;

      await expect(page.locator("table")).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanup();
    }
  });
});
