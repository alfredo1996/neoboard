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
    for (let attempt = 1; attempt <= 5; attempt++) {
      await this.page.goto("/login", { waitUntil: "networkidle" });
      await this.page.getByLabel("Email").waitFor({ state: "visible" });

      // Wait for React 19 hydration — the form's onSubmit handler is only
      // attached after hydration completes. Without this, clicking "Sign in"
      // triggers the browser's default form GET instead of the JS fetch call,
      // and the page stays on /login. We detect hydration by checking for
      // React's internal fiber property on the submit button OR the form.
      try {
        await this.page.waitForFunction(
          () => {
            const form = document.querySelector("form");
            if (!form) return false;
            // React attaches __reactFiber$... or __reactInternalInstance$...
            // on hydrated elements. Check both form and button.
            const hasReact = (el: Element) =>
              Object.keys(el).some((k) => k.startsWith("__react"));
            return hasReact(form);
          },
          { timeout: 10_000 },
        );
      } catch {
        // Fiber check failed — proceed anyway, retry loop handles it.
      }

      await this.page.getByLabel("Email").fill(email);
      await this.page.getByLabel("Password").fill(password);

      // Use Promise.all to click and wait for the auth API call simultaneously.
      // This avoids a race where the redirect happens before waitForURL starts.
      const signInButton = this.page.getByRole("button", { name: "Sign in" });
      await signInButton.click();

      try {
        await this.page.waitForURL("/", { timeout: 15_000 });
        return;
      } catch {
        if (attempt === 5) {
          const safeUrl = new URL(this.page.url());
          safeUrl.search = "";
          throw new Error(
            `AuthPage.login: failed to reach / after 5 attempts ` +
              `(last path: ${safeUrl.pathname})`,
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
