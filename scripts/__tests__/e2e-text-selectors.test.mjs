import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// A regex getByText(/Foo/) matches any element whose text contains the words,
// so a later feature that prints the same words anywhere breaks an unrelated
// spec through strict mode (#2262). Pick by role and exact name, or
// getByText("…", { exact: true }). A regex stays only where the text really
// has a variable part: list it below with the reason.
const E2E = resolve(dirname(fileURLToPath(import.meta.url)), "../../app/e2e");

// "<spec>: <regex source>" -> why the text cannot be matched exactly.
const ALLOWED = {};

/** Regex literals passed to getByText, even when the call wraps lines. */
export function regexGetByText(source) {
  return [
    ...source.matchAll(/getByText\(\s*(\/(?:\\.|[^/\\\n])+\/[a-z]*)/g),
  ].map((m) => ({
    regex: m[1],
    line: source.slice(0, m.index).split("\n").length,
  }));
}

function allCalls() {
  return readdirSync(E2E)
    .filter((f) => f.endsWith(".spec.ts"))
    .flatMap((f) =>
      regexGetByText(readFileSync(resolve(E2E, f), "utf8")).map((c) => ({
        ...c,
        key: `${f}: ${c.regex}`,
        at: `${f}:${c.line} ${c.regex}`,
      })),
    );
}

describe("E2E text selectors (#2262)", () => {
  it("no spec uses a regex getByText outside the allowlist", () => {
    expect(
      allCalls()
        .filter((c) => !(c.key in ALLOWED))
        .map((c) => c.at),
    ).toEqual([]);
  });

  it("every allowlist entry still matches a call and carries a reason", () => {
    const found = new Set(allCalls().map((c) => c.key));
    for (const [key, reason] of Object.entries(ALLOWED)) {
      expect(found.has(key), `stale allowlist entry ${key}`).toBe(true);
      expect(reason.length, `no reason for ${key}`).toBeGreaterThan(10);
    }
  });

  it.each([
    ["page.getByText(/x/)", "/x/"],
    ["page.getByText(/^First Name/i).first()", "/^First Name/i"],
    ["page.getByText(\n  /a\\/b/,\n)", "/a\\/b/"],
  ])("flags %s", (line, regex) => {
    expect(regexGetByText(line).map((m) => m.regex)).toEqual([regex]);
  });

  it.each([
    ['page.getByText("x", { exact: true })'],
    ['page.getByText("a/b")'],
    ['page.getByRole("heading", { name: /x/ })'],
  ])("leaves %s alone", (line) => {
    expect(regexGetByText(line)).toEqual([]);
  });
});
