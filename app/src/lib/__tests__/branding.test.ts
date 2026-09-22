import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCT_NAME, PRODUCT_PITCH, PRODUCT_DESCRIPTION } from "../branding";

/**
 * #1905, epic #1893. The pitch used to be written out four times — the page
 * title, the OpenGraph card, the Twitter card, and again on login and signup —
 * and every copy named the two connectors that happened to exist. It lives
 * here once now, and says nothing about which systems NeoBoard talks to.
 *
 * The guard in `connector-agnostic.test.ts` is what stops a connector name
 * coming back. This file is about the other half: that the constant is the
 * single source, so changing it changes every surface.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const CONSUMERS = [
  "app/layout.tsx",
  "app/(auth)/login/page.tsx",
  "app/(auth)/signup/page.tsx",
  "app/(dashboard)/page.tsx",
  "lib/api/openapi-spec.ts",
];

describe("branding", () => {
  it("states the pitch without naming a system it connects to", () => {
    expect(PRODUCT_PITCH).toBe("Make your systems talk, on one dashboard");
    expect(PRODUCT_NAME).toBe("NeoBoard");
  });

  it("builds the page title from the name and the pitch", () => {
    expect(PRODUCT_DESCRIPTION).toContain(PRODUCT_PITCH);
  });

  // The point of the constant. A consumer that inlines the words instead of
  // importing them is the defect this issue exists to remove, and it is
  // invisible to a render test that asserts the same literal.
  it.each(CONSUMERS)("%s imports the pitch rather than restating it", (rel) => {
    const source = readFileSync(join(SRC, rel), "utf8");
    expect(source).toMatch(/from "@\/lib\/branding"/);
    expect(source).not.toContain(PRODUCT_PITCH);
  });
});
