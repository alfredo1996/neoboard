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
    await expect(dashboardsBtn).toHaveAttribute("aria-current", "page");

    // Navigate to Connections — it should become active
    await sidebarPage.navigateTo("Connections");
    await expect(page).toHaveURL("/connections");
    const connectionsBtn = sidebarPage.getSidebarItem("Connections");
    await expect(connectionsBtn).toHaveAttribute("aria-current", "page");
    await expect(dashboardsBtn).not.toHaveAttribute("aria-current");

    // Navigate to Users — it should become active
    await sidebarPage.navigateTo("Users");
    await expect(page).toHaveURL("/users");
    const usersBtn = sidebarPage.getSidebarItem("Users");
    await expect(usersBtn).toHaveAttribute("aria-current", "page");
    await expect(connectionsBtn).not.toHaveAttribute("aria-current");
  });
});
