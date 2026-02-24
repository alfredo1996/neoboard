import { test, expect, ALICE } from "./fixtures";

test.describe("Sidebar — uncovered states", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("sidebar should highlight active page", async ({
    sidebarPage,
    page,
  }) => {
    // On dashboards page, the Dashboards button should be active
    const dashboardsBtn = sidebarPage.getSidebarItem("Dashboards");
    await expect(dashboardsBtn).toBeVisible();
    // Active sidebar items get font-medium class
    await expect(dashboardsBtn).toHaveClass(/font-medium/);

    // Navigate to Connections — it should become active
    await sidebarPage.navigateTo("Connections");
    await expect(page).toHaveURL("/connections");
    const connectionsBtn = sidebarPage.getSidebarItem("Connections");
    await expect(connectionsBtn).toHaveClass(/font-medium/);

    // Navigate to Users — it should become active
    await sidebarPage.navigateTo("Users");
    await expect(page).toHaveURL("/users");
    const usersBtn = sidebarPage.getSidebarItem("Users");
    await expect(usersBtn).toHaveClass(/font-medium/);
  });
});
