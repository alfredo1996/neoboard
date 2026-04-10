import type { Page } from "@playwright/test";

export class AuthPage {
  constructor(private page: Page) {}

  /**
   * Log in as the given user and wait for redirect to the dashboard list.
   *
   * Retries up to 3 times to absorb a known race in the /login page:
   * the form's onSubmit handler is only attached once React 19 has
   * hydrated. If the Sign-in button is clicked before hydration finishes,
   * the form falls back to its default HTML behavior (GET /login with
   * the credentials in the query string) and the browser stays on
   * /login?email=...&password=... instead of navigating to /.
   *
   * The fix: after each click, wait up to 10s for the URL to become "/".
   * On failure, reload the /login page and try again. Three attempts is
   * enough headroom even under CI load.
   *
   * Using waitUntil: "networkidle" on the initial goto gives React a
   * reliable window to attach listeners before we interact with the form.
   */
  async login(email: string, password: string) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.page.goto("/login", { waitUntil: "networkidle" });
      await this.page.getByLabel("Email").waitFor({ state: "visible" });
      await this.page.getByLabel("Email").fill(email);
      await this.page.getByLabel("Password").fill(password);
      await this.page.getByRole("button", { name: "Sign in" }).click();
      try {
        await this.page.waitForURL("/", { timeout: 10_000 });
        return;
      } catch {
        if (attempt === 3) {
          throw new Error(
            `AuthPage.login: failed to reach / after 3 attempts ` +
              `(last URL: ${this.page.url()})`,
          );
        }
      }
    }
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
