import type { Page } from "@playwright/test";

export class SidebarPage {
  constructor(private page: Page) {}

  async navigateTo(tab: "Dashboards" | "Connections" | "Users") {
    await this.page.getByRole("button", { name: tab }).click();
    await this.page.waitForLoadState("networkidle");
  }

  getSidebarItem(label: string) {
    return this.page.getByRole("button", { name: label });
  }
}
