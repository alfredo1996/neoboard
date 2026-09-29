import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// An E2E spec that picks a connection with a bare connector-label pattern —
// getByRole("option", { name: /PostgreSQL/ }) — also matches every connection
// of that connector another worker created, and strict mode then fails the
// click, depending on timing (#2071). Pick the seeded connection by name
// (SEEDED_PG_OPTION in app/e2e/fixtures.ts), or match a label exactly.
const E2E = resolve(dirname(fileURLToPath(import.meta.url)), "../../app/e2e");
const LOOSE = /getByRole\(\s*"option",\s*\{\s*name:\s*\/(PostgreSQL|Neo4j)\/i?\s*\}/;

describe("E2E option selectors (#2071)", () => {
  it("no spec selects an option by a bare connector-label pattern", () => {
    const offenders = readdirSync(E2E)
      .filter((f) => f.endsWith(".spec.ts"))
      .flatMap((f) =>
        readFileSync(resolve(E2E, f), "utf8")
          .split("\n")
          .map((line, i) => ({ f, n: i + 1, line }))
          .filter(({ line }) => LOOSE.test(line))
          .map(({ f, n }) => `${f}:${n}`),
      );
    expect(offenders).toEqual([]);
  });
});
