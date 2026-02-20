import type { Page } from "@playwright/test";

export class AuthPage {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.page.goto("/login");
    // Wait for the email field to be visible before filling — ensures React has
    // hydrated and attached form handlers so Sign in submits as POST, not GET.
    await this.page.getByLabel("Email").waitFor({ state: "visible" });
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Sign in" }).click();
    await this.page.waitForURL("/", { timeout: 15_000 });
  }

  async signup(name: string, email: string, password: string) {
    await this.page.goto("/signup");
    await this.page.getByLabel("Name").fill(name);
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password", { exact: true }).fill(password);
    await this.page.getByLabel("Confirm Password").fill(password);
    await this.page.getByRole("button", { name: "Create account" }).click();
  }

  async logout() {
    await this.page.getByRole("button", { name: "Sign out" }).click();
  }
}
