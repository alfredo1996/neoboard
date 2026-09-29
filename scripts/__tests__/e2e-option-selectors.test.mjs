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
const LABEL = String.raw`(postgres(ql)?|neo4j)`;

/** The loose forms Playwright treats as a substring match on an option. */
const LOOSE = [
  // name: /PostgreSQL/, /postgres/i, /Neo4j/ …
  new RegExp(
    String.raw`getByRole\(\s*["']option["'],\s*\{\s*name:\s*\/${LABEL}\/i?\s*[,}]`,
    "i",
  ),
  // name: "PostgreSQL" without exact: true (a string name is a substring match)
  new RegExp(
    String.raw`getByRole\(\s*["']option["'],\s*\{\s*name:\s*["']${LABEL}["']\s*(,\s*exact:\s*false\s*)?\}`,
    "i",
  ),
  // .filter({ hasText: /PostgreSQL/ }) or hasText: "PostgreSQL" on options
  new RegExp(
    String.raw`hasText:\s*(\/${LABEL}\/i?|["']${LABEL}["'])\s*\}`,
    "i",
  ),
];

function looseSelectors(source) {
  return source
    .split("\n")
    .map((line, i) => ({ n: i + 1, line }))
    .filter(({ line }) => LOOSE.some((re) => re.test(line)))
    .map(({ n }) => n);
}

describe("E2E option selectors (#2071)", () => {
  it("no spec selects an option by a bare connector-label pattern", () => {
    const offenders = readdirSync(E2E)
      .filter((f) => f.endsWith(".spec.ts"))
      .flatMap((f) =>
        looseSelectors(readFileSync(resolve(E2E, f), "utf8")).map(
          (n) => `${f}:${n}`,
        ),
      );
    expect(offenders).toEqual([]);
  });

  it.each([
    ['page.getByRole("option", { name: /PostgreSQL/ })'],
    ['page.getByRole("option", { name: /postgres/i })'],
    ["page.getByRole('option', { name: /Neo4j/ })"],
    ['page.getByRole("option", { name: "PostgreSQL" })'],
    ['page.getByRole("option", { name: "Neo4j", exact: false })'],
    ['page.getByRole("option").filter({ hasText: /PostgreSQL/ })'],
  ])("flags %s", (line) => {
    expect(looseSelectors(line)).toEqual([1]);
  });

  it.each([
    ['page.getByRole("option", { name: SEEDED_PG_OPTION })'],
    ['page.getByRole("option", { name: "PostgreSQL", exact: true })'],
    ['page.getByRole("option", { name: "Map", exact: true })'],
    ['page.getByRole("option", { name: /treemap/i })'],
  ])("leaves %s alone", (line) => {
    expect(looseSelectors(line)).toEqual([]);
  });
});
