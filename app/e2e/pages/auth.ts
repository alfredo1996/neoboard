import { expect, type Page } from "@playwright/test";

export class AuthPage {
  constructor(private page: Page) {}

  /**
   * Log in as the given user and wait for redirect to the dashboard list.
   *
   * Waits for the login form to advertise `data-hydrated="true"` before
   * touching it. Until React attaches onSubmit, a click runs the browser's
   * native GET submit and the page stays on /login?email=…&password=…
   * instead of navigating — which is also how a real user's password ends
   * up in their history, so the form now disables the button until then.
   *
   * This replaced a 3-attempt retry loop whose budget could not fit inside
   * the 30s test timeout: 3 x (goto networkidle + 10s waitForURL). Under
   * load the test was killed mid-retry, so the retry meant to save it never
   * ran — 21 failures on an idle machine, 121 on a loaded one, and not one
   * of them a real defect (#1272).
   *
   * The second attempt is kept only for a genuinely dropped navigation, not
   * for the hydration race, which is now impossible rather than absorbed.
   */
  async login(email: string, password: string) {
    // One attempt is enough now that the form advertises hydration (#1272).
    // The old loop clicked blind and retried: 3 x (goto networkidle + 10s
    // waitForURL) cannot fit inside the 30s test timeout, so under load the
    // test died mid-retry — 21 failures on an idle machine, 121 on a busy
    // one, none of them real. Waiting for the signal removes the race
    // instead of absorbing it.
    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.page.goto("/login");
      await this.page
        .locator('form[data-hydrated="true"]')
        .waitFor({ state: "attached", timeout: 10_000 });
      await this.page.getByLabel("Email").fill(email);
      await this.page.getByLabel("Password").fill(password);
      await this.page.getByRole("button", { name: "Sign in" }).click();
      try {
        await this.page.waitForURL("/", { timeout: 10_000 });
        break;
      } catch {
        if (attempt === 2) {
          // Strip query params from the URL before logging. In the exact
          // failure mode this retry loop exists for — form falls back to
          // GET /login?email=...&password=... — the URL contains the
          // plaintext password. Never let that land in CI logs.
          const safeUrl = new URL(this.page.url());
          safeUrl.search = "";
          throw new Error(
            `AuthPage.login: failed to reach / after 2 attempts ` +
              `(last path: ${safeUrl.pathname})`,
          );
        }
      }
    }
    // Reaching / is not proof of whose cookie the context holds: a late
    // response from the previous user's page can re-set theirs (#2016).
    await expect
      .poll(() => this.sessionEmail(), { message: `signed in as ${email}` })
      .toBe(email.trim().toLowerCase());
  }

  async signup(name: string, email: string, password: string) {
    await this.page.goto("/signup");
    await this.page.getByLabel("Name").fill(name);
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password", { exact: true }).fill(password);
    await this.page.getByLabel("Confirm Password").fill(password);
    await this.page.getByRole("button", { name: "Create account" }).click();
  }

  /**
   * Sign out and wait until the server sees no session (#2016). The click
   * starts next-auth's signOut, a fetch and then a redirect; a login() fired
   * before they finish raced them, and a probe sent after it could run under
   * the previous user's session.
   */
  async logout() {
    await this.page.getByRole("button", { name: "Sign out" }).click();
    await this.page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect.poll(() => this.sessionEmail()).toBeUndefined();
  }

  /**
   * The signed-in user's email, as the server reads this context's cookie.
   * Undefined only from a valid answer with no user: a failed request throws,
   * so a poll retries it rather than reading it as signed out.
   */
  private async sessionEmail(): Promise<string | undefined> {
    const res = await this.page.request.get("/api/auth/session");
    if (!res.ok()) {
      throw new Error(`GET /api/auth/session answered ${res.status()}`);
    }
    const body = (await res.json()) as { user?: { email?: string } } | null;
    return body?.user?.email;
  }
}
