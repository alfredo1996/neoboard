import { test, expect, ALICE } from "./fixtures";

test.describe("Navigation", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("sidebar should be visible on all pages", async ({ sidebarPage, page }) => {
    await expect(sidebarPage.getSidebarItem("Dashboards")).toBeVisible();
    await expect(sidebarPage.getSidebarItem("Connections")).toBeVisible();
    await expect(sidebarPage.getSidebarItem("Users")).toBeVisible();

    await sidebarPage.navigateTo("Connections");
    await expect(page).toHaveURL("/connections");
    await expect(sidebarPage.getSidebarItem("Dashboards")).toBeVisible();

    await sidebarPage.navigateTo("Users");
    await expect(page).toHaveURL("/users");
    await expect(sidebarPage.getSidebarItem("Dashboards")).toBeVisible();
  });

  test("should navigate between all tabs", async ({ sidebarPage, page }) => {
    await sidebarPage.navigateTo("Connections");
    await expect(page).toHaveURL("/connections");
    await expect(page.getByRole("heading", { level: 1, name: "Connections" })).toBeVisible({ timeout: 10000 });

    await sidebarPage.navigateTo("Users");
    await expect(page).toHaveURL("/users");
    await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible({ timeout: 10000 });

    await sidebarPage.navigateTo("Dashboards");
    await expect(page).toHaveURL("/");
  });
});
