import type { Page } from "@playwright/test";
import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";
import { openAccountMenu } from "./pages/sidebar";

// #2325: every way out of a dirty editor asks first, and Stay keeps the edit.
const leaveDialog = (page: Page) =>
  page.getByRole("alertdialog", { name: "Leave without saving?", exact: true });
const page2Tab = (page: Page) =>
  page.getByRole("tab", { name: "Page 2", exact: true });

async function dirtyEditor(page: Page, id: string) {
  await page.goto(`/${id}/edit`);
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await expect(page2Tab(page)).toBeVisible();
}

test.describe("Unsaved-changes guard covers every way out (#2325)", () => {
  const exits: [string, string, (p: Page) => Promise<void>][] = [
    [
      "Connections",
      "/connections",
      (p) =>
        p.getByRole("button", { name: "Connections", exact: true }).click(),
    ],
    [
      "Widget Library",
      "/widget-library",
      (p) =>
        p.getByRole("button", { name: "Widget Library", exact: true }).click(),
    ],
    [
      "Dashboards",
      "/",
      (p) => p.getByRole("button", { name: "Dashboards", exact: true }).click(),
    ],
    [
      "Settings",
      "/settings/profile",
      (p) => p.getByRole("button", { name: "Settings", exact: true }).click(),
    ],
    [
      "Profile",
      "/settings/profile",
      async (p) => {
        await openAccountMenu(p);
        await p.getByRole("menuitem", { name: "Profile", exact: true }).click();
      },
    ],
  ];

  for (const [name, target, exit] of exits) {
    test(`${name}: asks, Stay keeps the edit, Leave arrives`, async ({
      authPage,
      page,
    }) => {
      test.setTimeout(90_000);
      await authPage.login(ALICE.email, ALICE.password);
      const { id, cleanup } = await createTestDashboard(
        page.request,
        `Guard ${uid()}`,
      );
      try {
        await dirtyEditor(page, id);
        await exit(page);
        await expect(leaveDialog(page)).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`/${id}/edit$`));

        await page.getByRole("button", { name: "Stay", exact: true }).click();
        await expect(leaveDialog(page)).toHaveCount(0);
        await expect(page2Tab(page)).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`/${id}/edit$`));

        await exit(page);
        await page
          .getByRole("button", { name: "Leave without saving", exact: true })
          .click();
        await expect(page).toHaveURL(new RegExp(`${target}$`));
      } finally {
        await cleanup();
      }
    });
  }

  test("a clean editor leaves without asking", async ({ authPage, page }) => {
    test.setTimeout(90_000);
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Guard ${uid()}`,
    );
    try {
      await page.goto(`/${id}/edit`);
      await expect(
        page.getByRole("button", { name: "Add page", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Connections", exact: true })
        .click();
      await expect(page).toHaveURL(/\/connections$/);
    } finally {
      await cleanup();
    }
  });

  for (const choice of ["Stay", "Leave without saving"]) {
    test(`browser Back from a dirty editor: one dialog, ${choice}`, async ({
      authPage,
      page,
    }) => {
      test.setTimeout(90_000);
      await authPage.login(ALICE.email, ALICE.password);
      const { id, cleanup } = await createTestDashboard(
        page.request,
        `Guard ${uid()}`,
      );
      try {
        await page.goto("/");
        await page.goto(`/${id}`);
        await page.getByRole("button", { name: "Edit", exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/${id}/edit`));
        await page
          .getByRole("button", { name: "Add page", exact: true })
          .click();
        await expect(page2Tab(page)).toBeVisible();

        await page.goBack();
        await expect(leaveDialog(page)).toHaveCount(1);
        await expect(page).toHaveURL(new RegExp(`/${id}/edit`));
        // The tabs sit behind the modal (aria-hidden): checked after Stay.

        await page.getByRole("button", { name: choice, exact: true }).click();
        await expect(leaveDialog(page)).toHaveCount(0);
        if (choice === "Stay") {
          await expect(page).toHaveURL(new RegExp(`/${id}/edit`));
          await expect(page2Tab(page)).toBeVisible();
          await expect(
            page.getByRole("button", { name: "Add page", exact: true }),
          ).toBeVisible();
          // The held entry was pushed back: a second Back asks again.
          await page.goBack();
          await expect(leaveDialog(page)).toHaveCount(1);
        } else {
          await expect(page).toHaveURL(new RegExp(`/${id}$`));
          // View mode shows the server copy: only a fresh Edit proves the
          // working copy was dropped.
          await page.getByRole("button", { name: "Edit", exact: true }).click();
          await expect(page).toHaveURL(new RegExp(`/${id}/edit`));
          await expect(
            page.getByRole("button", { name: "Add page", exact: true }),
          ).toBeVisible();
          await expect(page2Tab(page)).toHaveCount(0);
        }
      } finally {
        await cleanup();
      }
    });
  }
});
