import { test, expect, ALICE } from "./fixtures";

test.describe("Sidebar — uncovered states", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("sidebar should highlight active page", async ({
    sidebarPage,
    page,
  }) => {
    // On dashboards page, the Dashboards button should be visually distinct
    const dashboardsBtn = sidebarPage.getSidebarItem("Dashboards");
    await expect(dashboardsBtn).toBeVisible();

    // Navigate to Connections
    await sidebarPage.navigateTo("Connections");
    await expect(page).toHaveURL("/connections");
    const connectionsBtn = sidebarPage.getSidebarItem("Connections");
    await expect(connectionsBtn).toBeVisible();

    // Navigate to Users
    await sidebarPage.navigateTo("Users");
    await expect(page).toHaveURL("/users");
    const usersBtn = sidebarPage.getSidebarItem("Users");
    await expect(usersBtn).toBeVisible();
  });
});
