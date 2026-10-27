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
const NEGATIVE =
  "Negative assertion over a family of messages: an exact string would pass vacuously, and a regex that finds nothing cannot trip strict mode.";

const ALLOWED = {
  "connections.spec.ts: /failed|error|refused|ECONNREFUSED/i":
    "The driver’s connection-failure message differs per connector and host.",
  "connections.spec.ts: /Enter a URI like/":
    "Prefix of a message whose tail is the connector’s own placeholder.",
  "connections.spec.ts: /2 widgets.*1 dashboard/i":
    "Usage sentence split across inline nodes; counts vary with fixture.",
  "connections.spec.ts: /something went wrong|uncaught|error boundary/i":
    NEGATIVE,
  "connector-unavailable.spec.ts: /Waiting for |to see this\\./": NEGATIVE,
  "dashboard-connection-reassign.spec.ts: /Query Failed|No connection/i":
    NEGATIVE,
  "dashboard-connection-reassign.spec.ts: /Moved 1 widget/i":
    "Message ends with the target connection’s display name, known only to the seed.",
  "dashboard-connection-reassign.spec.ts: /No connection/i": NEGATIVE,
  "dashboard-states.spec.ts: /Dashboard updated by/i": NEGATIVE,
  "form-widget.spec.ts: /Form submissions write to the database/i":
    "Prefix of a long multi-sentence notice.",
  "import-validation.spec.ts: /Invalid dashboard file/i":
    "Prefix of a message whose tail is the schema issue text.",
  "new-charts.spec.ts: /\\[Region\\]/":
    "A parameter name inside a composed sentence.",
  "new-charts.spec.ts: /\\$param_\\w/": NEGATIVE,
  "param-defaults.spec.ts: /Waiting for |to see this\\./": NEGATIVE,
  "parameters.spec.ts: /\\$param_/": NEGATIVE,
  "parameters.spec.ts: /\\w{3} \\d{1,2}, \\d{4}/":
    "A formatted date: the variable part is today’s date.",
  "parameters.spec.ts: /\\w{3} \\d{1,2}, \\d{4}\\s*–\\s*\\w{3} \\d{1,2}, \\d{4}/":
    "A formatted date range: the variable part is today’s date.",
  "parameters.spec.ts: /^\\d+ options? loaded — see preview$/":
    "The option count depends on the seeded data and pluralises.",
  "query-safety.spec.ts: /query.*failed/i": NEGATIVE,
  'query-safety.spec.ts: /syntax error at or near "create"/':
    "PostgreSQL's own error text, quoted from the driver.",
  "widget-states.spec.ts: /definitely_not_a_table|does not exist|syntax error/i":
    NEGATIVE,
  "widgets-look.spec.ts: /\\$param_/": NEGATIVE,
  "widgets-look.spec.ts: /Gallery region/": NEGATIVE,
  "widgets-look.spec.ts: /^Writes to /":
    "Ends with the form’s connection display name.",
  "widgets-look.spec.ts: /^customer:/":
    "A key line of the JSON viewer; the value follows in the same node.",
  "widgets.spec.ts: /Showing first .* rows/": NEGATIVE,
};

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
