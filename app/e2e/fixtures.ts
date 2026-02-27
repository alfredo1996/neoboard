import { test as base } from "@playwright/test";
import { collectClientCoverage } from "nextcov/playwright";
import * as dotenv from "dotenv";
import * as path from "node:path";
import { AuthPage } from "./pages/auth";
import { SidebarPage } from "./pages/sidebar";

// Load test container env vars (quiet suppresses dotenvx tip banners).
dotenv.config({ path: path.resolve(__dirname, "..", ".env.test"), quiet: true });

/** Seed user credentials (from docker/postgres/init.sql). */
export const ALICE = { email: "alice@example.com", password: "password123" };
export const BOB = { email: "bob@example.com", password: "password123" };

/** Dynamic test container URLs. */
export const TEST_NEO4J_BOLT_URL = process.env.TEST_NEO4J_BOLT_URL ?? "bolt://localhost:7687";
export const TEST_PG_PORT = process.env.TEST_PG_PORT ?? "5432";

type Fixtures = {
  authPage: AuthPage;
  sidebarPage: SidebarPage;
  coverage: void;
};

export const test = base.extend<Fixtures>({
  authPage: async ({ page }, use) => {
    await use(new AuthPage(page));
  },
  sidebarPage: async ({ page }, use) => {
    await use(new SidebarPage(page));
  },
  coverage: [
    async ({ page }, use, testInfo) => {
      if (process.env.E2E_COVERAGE !== "1") {
        await use();
        return;
      }
      await collectClientCoverage(page, testInfo, use);
    },
    { scope: "test", auto: true },
  ],
});

export { expect } from "@playwright/test";
