import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// A regex getByText(/Foo/) matches any element whose text contains the words,
// so a later feature that prints the same words anywhere breaks an unrelated
// spec through strict mode (#2262). Pick by role and exact name, or
// getByText("…", { exact: true }). A regex stays only where the text really
// has a variable part: list it below with the reason.
const E2E = resolve(dirname(fileURLToPath(import.meta.url)), "../../app/e2e");

// "<spec>: <regex source>" -> why the text cannot be matched exactly.
const NEGATIVE =
  "Negative assertion over a family of messages: an exact string would pass vacuously, and a regex that finds nothing cannot trip strict mode.";

// "<spec>: <regex source>" -> how many calls the spec may hold (default 1).
const COUNTS = {
  "parameters.spec.ts: /^\\d+ options? loaded — see preview$/": 2,
  "widgets-look.spec.ts: /Gallery region/": 2,
  "widgets-look.spec.ts: /^customer:/": 2,
};

const ALLOWED = {
  "connections.spec.ts: /failed|error|refused|ECONNREFUSED/i":
    "The driver’s connection-failure message differs per connector and host.",
  "connections.spec.ts: /Enter a URI like/":
    "Prefix of a message whose tail is the connector’s own placeholder.",
  "connections.spec.ts: /something went wrong|uncaught|error boundary/i":
    NEGATIVE,
  "connector-unavailable.spec.ts: /Waiting for |to see this\\./": NEGATIVE,
  "dashboard-connection-reassign.spec.ts: /Query Failed|No connection/i":
    NEGATIVE,
  "dashboard-connection-reassign.spec.ts: /No connection/i": NEGATIVE,
  "dashboard-states.spec.ts: /Dashboard updated by/i": NEGATIVE,
  "import-validation.spec.ts: /Invalid dashboard file/i":
    "Prefix of a message whose tail is the schema issue text.",
  "new-charts.spec.ts: /\\[Region\\]/":
    "A parameter name inside a composed sentence.",
  "new-charts.spec.ts: /\\$param_\\w/": NEGATIVE,
  "param-defaults.spec.ts: /Waiting for |to see this\\./": NEGATIVE,
  "parameters.spec.ts: /\\$param_/": NEGATIVE,
  "parameters.spec.ts: /^\\w{3} \\d{1,2}, \\d{4}$/":
    "A formatted date: the variable part is today’s date.",
  "parameters.spec.ts: /^\\w{3} \\d{1,2}, \\d{4}\\s*–\\s*\\w{3} \\d{1,2}, \\d{4}$/":
    "A formatted date range: the variable part is today’s date.",
  "parameters.spec.ts: /^\\d+ options? loaded — see preview$/":
    "The option count depends on the seeded data and pluralises.",
  "query-safety.spec.ts: /query.*failed/i": NEGATIVE,
  'query-safety.spec.ts: /syntax error at or near "create"/':
    "PostgreSQL's own error text, quoted from the driver.",
  "showcase.walkthrough.ts: /Waiting for |to see this\\.|No data|Incompatible data format|No connection configured|No query configured|Unknown chart type/":
    NEGATIVE,
  "widget-states.spec.ts: /definitely_not_a_table|does not exist|syntax error/i":
    NEGATIVE,
  "widgets-look.spec.ts: /\\$param_/": NEGATIVE,
  "widgets-look.spec.ts: /Gallery region/": NEGATIVE,
  "widgets-look.spec.ts: /^customer:/":
    "A key line of the JSON viewer; the value follows in the same node.",
  "widgets.spec.ts: /Showing first .* rows/": NEGATIVE,
};

/** Regex literals (or new RegExp) passed to getByText, even when the call wraps lines. */
export function regexGetByText(source) {
  return [
    ...source.matchAll(
      /getByText\(\s*(\/(?:\\.|[^/\\\n])+\/[a-z]*|new RegExp\()/g,
    ),
  ].map((m) => ({
    regex: m[1],
    line: source.slice(0, m.index).split("\n").length,
  }));
}

/** Calls beyond the count an allowlist key permits (default once). */
export function overBudget(calls, allowed = ALLOWED, counts = COUNTS) {
  const seen = {};
  return calls
    .filter((c) => {
      seen[c.key] = (seen[c.key] ?? 0) + 1;
      return c.key in allowed && seen[c.key] > (counts[c.key] ?? 1);
    })
    .map((c) => c.at);
}

// Ratchet (#2317): getByRole(…, { name: "X" }) and getByText("X") without
// `exact: true` match substrings, so a later feature that prints the same
// words breaks an unrelated spec through strict mode. Today's offenders are a
// counted baseline per spec that may only go down; new code uses `exact: true`.
// A name or text that is a variable or other expression is not counted: its
// type is unknown without type-checking, and it may well be a RegExp.
// BASELINE was generated once from the tree at 7687d76c by running
// nonExactCalls() over every .ts under app/e2e (keyed by path relative to it)
// and keeping the non-zero counts. A PR that converts selectors must lower
// that file's baseline in the same change: two such PRs in one file can each
// merge cleanly and still turn the base red as stale.
const BASELINE = {
  "api-docs.spec.ts": { role: 1 },
  "api-keys.spec.ts": { role: 22 },
  "auth-states.spec.ts": { role: 11, text: 6 },
  "auth.spec.ts": { role: 20, text: 6 },
  "auto-refresh.spec.ts": { role: 4 },
  "bar-stack-mode.spec.ts": { role: 6, text: 1 },
  "chart-export.spec.ts": { role: 5 },
  "charts.spec.ts": { role: 97, text: 36 },
  "code-completion.spec.ts": { role: 19 },
  "connection-advanced.spec.ts": { role: 18, text: 11 },
  "connection-sharing.spec.ts": { role: 6 },
  "connections.spec.ts": { role: 25, text: 1 },
  "connector-unavailable.spec.ts": { role: 4, text: 5 },
  "content-widgets.spec.ts": { role: 21, text: 2 },
  "dashboard-autosave-error.spec.ts": { role: 2 },
  "dashboard-connection-reassign.spec.ts": { role: 11, text: 2 },
  "dashboard-editor.spec.ts": { role: 12 },
  "dashboard-export-error.spec.ts": { role: 2 },
  "dashboard-filters.spec.ts": { role: 4 },
  "dashboard-header.spec.ts": { role: 1, text: 1 },
  "dashboard-metadata.spec.ts": { role: 5, text: 1 },
  "dashboard-portability.spec.ts": { role: 13, text: 6 },
  "dashboard-states.spec.ts": { role: 27, text: 22 },
  "dashboard-visibility.spec.ts": { role: 1, text: 5 },
  "dashboards.spec.ts": { role: 26 },
  "design-system.spec.ts": { role: 27, text: 5 },
  "edit-needs-write.spec.ts": { role: 5, text: 1 },
  "edit-page-preservation.spec.ts": { role: 7, text: 3 },
  "edit-scroll-position.spec.ts": { text: 1 },
  "editor-maximize.spec.ts": { role: 11 },
  "empty-states.spec.ts": { role: 14, text: 4 },
  "fixtures.ts": { role: 3 },
  "form-submit-dashboard-access.spec.ts": { role: 2, text: 1 },
  "form-widget.spec.ts": { role: 80, text: 17 },
  "grid.spec.ts": { role: 1 },
  "heavy-widgets.spec.ts": { role: 35, text: 7 },
  "import-validation.spec.ts": { role: 7, text: 9 },
  "navigation.spec.ts": { role: 2 },
  "new-charts.spec.ts": { role: 57, text: 6 },
  "page-tabs-overflow.spec.ts": { role: 10, text: 5 },
  "pages/auth.ts": { role: 3 },
  "param-defaults.spec.ts": { role: 7, text: 1 },
  "parameter-types.spec.ts": { role: 5, text: 3 },
  "parameter-url-sync.spec.ts": { role: 3 },
  "parameters.spec.ts": { role: 138, text: 60 },
  "query-safety.spec.ts": { role: 2, text: 2 },
  "responsive.spec.ts": { role: 10, text: 1 },
  "settings-profile.spec.ts": { role: 11, text: 5 },
  "share-needs-write.spec.ts": { role: 1 },
  "sharing-permissions.spec.ts": { role: 11, text: 7 },
  "showcase.walkthrough.ts": { role: 16, text: 1 },
  "sso-gating.spec.ts": { role: 5 },
  "styling-rules.spec.ts": { role: 34, text: 18 },
  "table-column-filters.spec.ts": { role: 3, text: 25 },
  "table-graph-cells.spec.ts": { role: 1 },
  "table-grouping.spec.ts": { role: 2 },
  "table-pager-fit.spec.ts": { role: 1 },
  "theme.spec.ts": { role: 12 },
  "transforms.spec.ts": { role: 20, text: 13 },
  "users.spec.ts": { role: 38, text: 4 },
  "view-share-saved-query-text.spec.ts": { role: 1 },
  "widget-cards.spec.ts": { role: 5 },
  "widget-csv-export.spec.ts": { role: 2 },
  "widget-library.spec.ts": { role: 59, text: 4 },
  "widget-saved-database.spec.ts": { role: 12, text: 2 },
  "widget-states.spec.ts": { role: 34, text: 20 },
  "widgets-look.spec.ts": { role: 6, text: 6 },
  "widgets.spec.ts": { role: 68, text: 4 },
};

// A literal, a template, a concatenation with a string operand, both branches
// of a conditional, and parentheses or `as` around any of these. A bare
// identifier or property access is not counted (see above).
const isStringy = (n) => {
  if (!n) return false;
  if (ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) return true;
  if (unwrap(n) !== n) return isStringy(unwrap(n));
  if (ts.isConditionalExpression(n))
    return isStringy(n.whenTrue) && isStringy(n.whenFalse);
  return (
    ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.PlusToken &&
    (isStringy(n.left) || isStringy(n.right))
  );
};
const unwrap = (n) =>
  n &&
  (ts.isParenthesizedExpression(n) ||
    ts.isAsExpression(n) ||
    ts.isSatisfiesExpression(n) ||
    ts.isNonNullExpression(n))
    ? unwrap(n.expression)
    : n;
const prop = (obj, name) =>
  obj?.properties.find(
    (p) =>
      p.name &&
      (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) &&
      p.name.text === name,
  );
const exactTrue = (opts) =>
  prop(opts, "exact")?.initializer?.kind === ts.SyntaxKind.TrueKeyword;

/** getByRole name strings and getByText strings lacking `exact: true`, even across lines. */
export function nonExactCalls(source) {
  const sf = ts.createSourceFile("x.ts", source, ts.ScriptTarget.Latest, true);
  const found = [];
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const fn = n.expression.name.text;
      const [a, rawB] = n.arguments;
      const b = unwrap(rawB);
      const opts = b && ts.isObjectLiteralExpression(b) ? b : undefined;
      let target;
      if (fn === "getByRole") target = prop(opts, "name")?.initializer;
      else if (fn === "getByText") target = a;
      if (isStringy(target) && !exactTrue(opts)) {
        found.push({
          kind: fn === "getByRole" ? "role" : "text",
          line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
        });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

const where = (ls = [], f) =>
  ls
    .slice(0, 10)
    .map((l) => `${f}:${l}`)
    .join(", ") + (ls.length > 10 ? `, … ${ls.length - 10} more` : "");

/** Messages for every spec whose count differs from its baseline. */
export function ratchetFailures(counts, baseline = BASELINE, lines = {}) {
  const out = [];
  for (const f of new Set([...Object.keys(counts), ...Object.keys(baseline)])) {
    for (const kind of ["role", "text"]) {
      const n = counts[f]?.[kind] ?? 0;
      const base = baseline[f]?.[kind] ?? 0;
      if (n > base)
        out.push(
          `${f}: ${n} non-exact ${kind} selectors, baseline ${base}. Add \`exact: true\`; calls at ${where(lines[f]?.[kind], f)}.`,
        );
      else if (n < base)
        out.push(
          `${f}: ${n} non-exact ${kind} selectors, baseline ${base} is stale. Lower the baseline to ${n}.`,
        );
    }
  }
  return out;
}

/** Every .ts under app/e2e (specs, helpers, page objects, subfolders), as paths relative to it. */
export function e2eTsFiles(paths) {
  return paths
    .map((p) => p.replaceAll("\\", "/"))
    .filter((p) => p.endsWith(".ts"))
    .sort();
}

const files = () => e2eTsFiles(readdirSync(E2E, { recursive: true }));

function treeCounts() {
  const counts = {};
  const lines = {};
  for (const f of files()) {
    for (const c of nonExactCalls(readFileSync(resolve(E2E, f), "utf8"))) {
      counts[f] ??= {};
      counts[f][c.kind] = (counts[f][c.kind] ?? 0) + 1;
      lines[f] ??= {};
      (lines[f][c.kind] ??= []).push(c.line);
    }
  }
  return { counts, lines };
}

function allCalls() {
  return files().flatMap((f) =>
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

  it("an allowlisted regex is not used more often than listed", () => {
    expect(overBudget(allCalls())).toEqual([]);
  });

  it("flags a second call that shares an allowlisted key", () => {
    const key = "a.spec.ts: /x/";
    const call = { key, at: "a.spec.ts:2 /x/" };
    expect(overBudget([call, call], { [key]: "r" })).toEqual([call.at]);
    expect(overBudget([call], { [key]: "r" })).toEqual([]);
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
    ["page.getByText(new RegExp(year)).first()", "new RegExp("],
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

  it.each([
    ['page.getByRole("button", { name: "Save" })', "role"],
    ["page.getByRole('button', { name: `Save ${x}` })", "role"],
    ['page.getByText("Saved")', "text"],
    ['page.getByRole("button", {\n  name: "Save",\n})', "role"],
    ['page.getByText(\n  "Saved",\n  { exact: false },\n)', "text"],
    ['page.getByRole("button", { name: "Save" } as const)', "role"],
    ['page.getByRole("button", { "name": "Save" })', "role"],
    ['page.getByText("Saved", { "exact": false })', "text"],
  ])("ratchet flags %s", (src, kind) => {
    expect(nonExactCalls(src).map((c) => c.kind)).toEqual([kind]);
  });

  it.each([
    ['page.getByRole("button", { name: "Save", exact: true })'],
    ['page.getByRole("button", {\n  name: "Save",\n  exact: true,\n})'],
    ['page.getByText("Saved", { exact: true })'],
    ['page.getByText(\n  "Saved",\n  { exact: true },\n)'],
    ['page.getByRole("button", { name: label })'],
    ['page.getByRole("button", { name: /Save/ })'],
    ['page.getByRole("button")'],
    ['page.getByText("Saved", { exact: true } as const)'],
    ['page.getByText("Saved", { exact: true } satisfies Opts)'],
    ['page.getByText("Saved", ({ exact: true }))'],
    ['page.getByText("Saved", { "exact": true })'],
    ['page.getByRole("button", { "name": "Save", "exact": true })'],
  ])("ratchet leaves %s alone", (src) => {
    expect(nonExactCalls(src)).toEqual([]);
  });

  it("ratchet fails above the baseline, below it (stale) and passes at it", () => {
    const base = { "a.spec.ts": { role: 2 } };
    const over = ratchetFailures({ "a.spec.ts": { role: 3 } }, base);
    expect(over).toHaveLength(1);
    expect(over[0]).toContain("Add `exact: true`");
    expect(ratchetFailures({ "a.spec.ts": { role: 1 } }, base)[0]).toContain(
      "Lower the baseline to 1",
    );
    expect(ratchetFailures({ "a.spec.ts": { role: 2 } }, base)).toEqual([]);
    expect(ratchetFailures({ "b.spec.ts": { text: 1 } }, base)).toHaveLength(2);
  });

  it("scans helpers and subfolders, not only top-level specs", () => {
    expect(
      e2eTsFiles([
        "a.spec.ts",
        "fixtures.ts",
        "pages/auth.ts",
        "sub/b.spec.ts",
        "fixtures/x.json",
      ]),
    ).toEqual(["a.spec.ts", "fixtures.ts", "pages/auth.ts", "sub/b.spec.ts"]);
  });

  it("one kind cannot trade off against the other", () => {
    expect(
      ratchetFailures(
        { "a.spec.ts": { role: 1, text: 1 } },
        { "a.spec.ts": { role: 2 } },
      ),
    ).toHaveLength(2);
  });

  it("names the line of each offending call", () => {
    expect(
      ratchetFailures(
        { "a.spec.ts": { role: 1 } },
        {},
        { "a.spec.ts": { role: [7] } },
      )[0],
    ).toContain("a.spec.ts:7");
  });

  it.each([
    ['page.getByRole("button", { name: "Role for " + email })', "role"],
    ['page.getByText(ok ? "Yes" : "No")', "text"],
    ['page.getByText(("Saved"))', "text"],
    ['page.getByText("Saved" as string)', "text"],
  ])("ratchet flags composed %s", (src, kind) => {
    expect(nonExactCalls(src).map((c) => c.kind)).toEqual([kind]);
  });

  it("the real tree holds its non-exact selector baseline", () => {
    const { counts, lines } = treeCounts();
    expect(ratchetFailures(counts, BASELINE, lines)).toEqual([]);
  });
});
