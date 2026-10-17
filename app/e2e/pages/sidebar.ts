import type { Page } from "@playwright/test";

/** The sidebar's account button opens a menu with Theme, Profile and Sign out. */
export async function openAccountMenu(page: Page) {
  await page.getByRole("button", { name: /^Account:/ }).click();
}

/** Account menu, then its Theme submenu (Light, Dark, System). */
export async function openThemeMenu(page: Page) {
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: /^Theme/ }).click();
}

export class SidebarPage {
  constructor(private page: Page) {}

  async navigateTo(
    tab: "Dashboards" | "Connections" | "Users" | "Widget Lab" | "Settings",
  ) {
    await this.page.getByRole("button", { name: tab }).click();
    await this.page.waitForLoadState("networkidle");
  }

  getSidebarItem(label: string) {
    return this.page.getByRole("button", { name: label });
  }
}
