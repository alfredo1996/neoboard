/**
 * Connector-agnosticism guards (#1894, epic #1893).
 *
 * NeoBoard is one dashboard where any number of systems collaborate. `app/`
 * and `component/` may know THAT connectors exist — never WHICH. A line there
 * that would have to change when connector N+1 is added is a bug, and until
 * now nothing failed when one was written: the rule lived in nobody's head,
 * so every seam refactor left connector constants behind.
 *
 * Two guards, both fed by the real registry (`getAllConnectors()`), so a newly
 * registered connector is forbidden from birth with no edit to this file:
 *
 *  1. the name guard — no registered connector's type, label, URI scheme or
 *     driver-option prefix in `app/src` / `component/src` source;
 *  2. the export-surface guard — `connection` and `connector-sdk` export no
 *     identifier that names a connector.
 *
 * Each is a **shrinking ratchet**, in the style of `tenant-scope.test.ts`:
 * today's offenders are recorded in `connector-agnostic.baseline.json`, a new
 * offence fails, and so does an entry that no longer offends — the list can
 * only get shorter, and it cannot rot. The epic closes when it is empty.
 *
 * If this fails on your change, the fix is to read the fact off the connector
 * (the registry / descriptor, server-side), not to raise a baseline number.
 */
import { describe, it, expect } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  getAllConnectors,
  registerConnector,
  unregisterConnector,
  type ConnectorPlugin,
} from "@neoboard/connection";
import baseline from "./connector-agnostic.baseline.json";

const ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);
const BASELINE_FILE = "app/src/lib/__tests__/connector-agnostic.baseline.json";

// ─── Permanent allowlist ─────────────────────────────────────────────
//
// The only names that stay once the baseline is empty. Query-language names
// (`cypher`, `sql`) need no entry: a language is not a connector, and no
// connector is registered under one.

/** Trees the name guard does not read. */
const ALLOWED_PATHS: { prefix: string; reason: string }[] = [
  {
    prefix: "app/src/lib/db/",
    reason:
      "the app's OWN metadata PostgreSQL (Drizzle, pgTable, migrations) — " +
      "where NeoBoard stores dashboards, unrelated to the connectors it queries",
  },
  {
    prefix: "component/src/lib/cypher-lang/",
    reason: "vendored Cypher grammar, kept byte-close to upstream",
  },
];

/** Third-party names that merely contain a connector's name; blanked before counting. */
const LIBRARY_NAMES: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /@neo4j-nvl\/[\w-]+/g,
    reason: "npm scope of the NVL graph renderer — a drawing library",
  },
  {
    pattern: /@neo4j-cypher\/[\w-]+/g,
    reason: "npm scope of the Cypher editor support — a language library",
  },
  {
    pattern:
      /\bPostgreSQL\b(?=[^\n]*@codemirror\/lang-sql)|\bdialect:\s*PostgreSQL\b/g,
    reason:
      "@codemirror/lang-sql names its SQL dialect export `PostgreSQL`; " +
      "importing and passing it is a fact about the `sql` language",
  },
];

// ─── Names, derived ──────────────────────────────────────────────────

type Named = Pick<ConnectorPlugin, "type" | "label" | "allowedProtocols">;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `pg` abbreviates `postgresql`: same first letter, letters in order. */
const abbreviates = (short: string, full: string) =>
  short[0] === full[0] &&
  new RegExp([...short].map(escapeRe).join(".*")).test(full);

/**
 * What may not be written, from whatever is registered: every connector's
 * `type`, `label` and URI schemes (`bolt+s:` → `bolt`), case-insensitively and
 * anywhere in a word, so `isNeo4j` and `PostgresSchemaManager` count too.
 *
 * `optionKeys` are the keys a connector reads off its `advancedOptions`. When
 * their prefix abbreviates the connector's type (`pgMaxPoolSize`), that prefix
 * is forbidden as `\bpg[A-Z]` — case-sensitively, or `jpg` would offend.
 *
 * ponytail: schemes match as substrings. A connector registering a generic
 * scheme (`https:`) would forbid every URL; narrow the scheme rule to
 * `scheme:` / `"scheme"` the day one does.
 */
export function forbiddenNames(
  connectors: Named[],
  optionKeys: { type: string; key: string }[] = [],
): RegExp[] {
  const names = [
    ...new Set(
      connectors
        .flatMap((c) => [
          c.type,
          c.label,
          ...(c.allowedProtocols ?? []).map((p) => p.split(/[+:]/)[0]),
        ])
        .filter(Boolean)
        .map((n) => n.toLowerCase()),
    ),
  ];
  if (names.length === 0) {
    throw new Error(
      "no connector is registered — the guard would forbid nothing",
    );
  }
  const byName = new RegExp(names.map(escapeRe).join("|"), "gi");
  const prefixes = [
    ...new Set(
      optionKeys.flatMap(({ type, key }) => {
        const prefix = /^[a-z][a-z0-9]*(?=[A-Z])/.exec(key)?.[0];
        return prefix && abbreviates(prefix, type.toLowerCase())
          ? [prefix]
          : [];
      }),
    ),
    // `neo4jMaxPoolSize` already offends by name; counting it twice helps nobody.
  ].filter((p) => p.search(byName) === -1);
  return prefixes.length === 0
    ? [byName]
    : [
        byName,
        new RegExp(`\\b(?:${prefixes.map(escapeRe).join("|")})(?=[A-Z])`, "g"),
      ];
}

/**
 * The option keys each built-in connector reads, from its own source: every
 * `connection/src/<dir>/` holding a `plugin.ts`. This is where `pg` comes from
 * — it is PostgresAuthenticationModule's spelling, not a constant in here.
 * (An external connector's source is not on disk; its type, label and schemes
 * still come from the registry.)
 */
function builtInOptionKeys(): { type: string; key: string }[] {
  const src = join(ROOT, "connection", "src");
  return readdirSync(src).flatMap((dir) => {
    const plugin = join(src, dir, "plugin.ts");
    const type =
      existsSync(plugin) &&
      /\btype:\s*"([^"]+)"/.exec(readFileSync(plugin, "utf8"))?.[1];
    if (!type) return [];
    return sourceFiles(join(src, dir)).flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/advancedOptions\??\.(\w+)/gi)].map(
        (m) => ({
          type,
          key: m[1],
        }),
      ),
    );
  });
}

// ─── Name guard ──────────────────────────────────────────────────────

interface SourceFile {
  /** Repo-relative, forward slashes. */
  file: string;
  src: string;
}

/**
 * file → how many times it names a connector. Pure, so the tests below can
 * feed it fixtures: a scanner that silently matches nothing passes forever.
 */
export function findOffenders({
  names,
  files,
}: {
  names: RegExp[];
  files: SourceFile[];
}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { file, src } of files) {
    if (ALLOWED_PATHS.some((p) => file.startsWith(p.prefix))) continue;
    const code = LIBRARY_NAMES.reduce((s, l) => s.replace(l.pattern, ""), src);
    const count = names.reduce((n, re) => n + (code.match(re)?.length ?? 0), 0);
    if (count > 0) out[file] = count;
  }
  return out;
}

/** Non-test, non-story TypeScript under `dir`. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      sourceFiles(p, out);
    } else if (/\.tsx?$/.test(p) && !/\.(?:test|stories)\.tsx?$/.test(p)) {
      out.push(p);
    }
  }
  return out;
}

function readTree(root: string, dirs: string[]): SourceFile[] {
  return dirs
    .flatMap((d) => sourceFiles(join(root, d)))
    .map((abs) => ({
      file: relative(root, abs).split(sep).join("/"),
      src: readFileSync(abs, "utf8"),
    }));
}

// ─── Export-surface guard ────────────────────────────────────────────

/** Every identifier a module exports, types included (they vanish at runtime). */
export function exportedNames(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  return sf.statements.flatMap((s) => {
    if (ts.isExportDeclaration(s)) {
      if (!s.exportClause) {
        // Nothing is skipped quietly: a star hides names from this guard.
        throw new Error(
          `${file}: \`export *\` hides its names — re-export by name`,
        );
      }
      return ts.isNamedExports(s.exportClause)
        ? s.exportClause.elements.map((e) => e.name.text)
        : [s.exportClause.name.text];
    }
    const exported =
      ts.canHaveModifiers(s) &&
      ts.getModifiers(s)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) return [];
    if (ts.isVariableStatement(s)) {
      return s.declarationList.declarations.map((d) => d.name.getText(sf));
    }
    const name = (s as ts.DeclarationStatement).name;
    return name ? [name.getText(sf)] : [];
  });
}

/** `file::identifier` → 1 for every exported identifier that names a connector. */
export function exportOffenders(
  names: RegExp[],
  files: SourceFile[],
): Record<string, number> {
  return Object.fromEntries(
    files.flatMap(({ file, src }) =>
      exportedNames(file, src)
        .filter((id) => names.some((re) => id.search(re) !== -1))
        .map((id) => [`${file}::${id}`, 1]),
    ),
  );
}

const PUBLIC_ENTRY_POINTS = [
  "connection/src/index.ts",
  "connector-sdk/src/index.ts",
];

// ─── The ratchet ─────────────────────────────────────────────────────

/**
 * Why the tree and the baseline disagree, one line per entry; empty when they
 * match exactly. More than recorded is a new offence. Fewer is progress the
 * baseline has not caught up with — also a failure, or the list would rot
 * into permission for whoever offends there next.
 */
export function baselineDrift(
  actual: Record<string, number>,
  recorded: Record<string, number>,
): string[] {
  const keys = [
    ...new Set([...Object.keys(actual), ...Object.keys(recorded)]),
  ].sort();
  return keys.flatMap((key) => {
    const found = actual[key] ?? 0;
    const allowed = recorded[key] ?? 0;
    if (found > allowed) {
      return [
        `${key}: names a connector ${found}×, baseline allows ${allowed} — ` +
          "take the fact from the registry instead of naming the connector",
      ];
    }
    if (found < allowed) {
      return [
        `${key}: baseline records ${allowed}, found ${found} — ` +
          (found === 0 ? "delete the entry" : `lower the entry to ${found}`) +
          ` in ${BASELINE_FILE}`,
      ];
    }
    return [];
  });
}

const total = (counts: Record<string, number>) =>
  Object.values(counts).reduce((a, b) => a + b, 0);

// ─── Tests ───────────────────────────────────────────────────────────

describe("connector-agnostic guard (#1894)", () => {
  const names = forbiddenNames(getAllConnectors(), builtInOptionKeys());
  const recordedNames: Record<string, number> = baseline.names;
  const recordedExports = Object.fromEntries(
    Object.entries(baseline.exports as Record<string, string[]>).flatMap(
      ([file, ids]) => ids.map((id) => [`${file}::${id}`, 1]),
    ),
  );

  it("forbids something for every registered connector", () => {
    // Not a pin on today's names — that would need editing for connector N+1.
    // A floor instead: each connector's own type and label must trip the guard.
    const connectors = getAllConnectors();
    expect(connectors.length).toBeGreaterThan(0);
    for (const c of connectors) {
      const files = [
        { file: "app/src/x.ts", src: `const a = "${c.type}";` },
        { file: "component/src/y.tsx", src: `// ${c.label}` },
      ];
      expect(findOffenders({ names, files }), c.type).toEqual({
        "app/src/x.ts": 1,
        "component/src/y.tsx": 1,
      });
    }
  });

  it("app/ and component/ name no connector beyond the baseline", () => {
    const files = readTree(ROOT, ["app/src", "component/src"]);
    // A floor, for the day the baseline is empty: a walker that finds no
    // files would otherwise pass as "no offenders".
    expect(files.length).toBeGreaterThan(300);
    const actual = findOffenders({ names, files });
    console.log(
      `connector-name baseline: ${total(recordedNames)} occurrences in ` +
        `${Object.keys(recordedNames).length} files (target: 0)`,
    );
    expect(baselineDrift(actual, recordedNames)).toEqual([]);
  });

  it("connection and connector-sdk export no connector-named identifier beyond the baseline", () => {
    const actual = exportOffenders(
      names,
      PUBLIC_ENTRY_POINTS.map((file) => ({
        file,
        src: readFileSync(join(ROOT, file), "utf8"),
      })),
    );
    console.log(
      `connector-named export baseline: ${total(recordedExports)} identifiers ` +
        `in ${Object.keys(baseline.exports).length} files (target: 0)`,
    );
    expect(baselineDrift(actual, recordedExports)).toEqual([]);
  });
});

describe("the guards themselves", () => {
  const fixture: ConnectorPlugin = {
    type: "acmegraph",
    label: "Acme Graph DB",
    category: "database",
    allowedProtocols: ["acme:", "acme+s:"],
    createModule: () => {
      throw new Error("never connected");
    },
  };

  it("a planted connector literal in a source file fails the name guard", () => {
    const [{ type }] = getAllConnectors();
    const root = mkdtempSync(join(tmpdir(), "connector-agnostic-"));
    const plant = (file: string) => {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), `export const kind = "${type}";\n`);
    };
    try {
      plant("app/src/planted.ts");
      // Same literal where it is allowed: a test, a story, the metadata DB.
      plant("app/src/__tests__/planted.test.ts");
      plant("component/src/planted.stories.tsx");
      plant("app/src/lib/db/schema.ts");
      const found = findOffenders({
        names: forbiddenNames(getAllConnectors()),
        files: readTree(root, ["app/src", "component/src"]),
      });
      expect(found).toEqual({ "app/src/planted.ts": 1 });
      expect(baselineDrift(found, {})).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a newly registered connector is forbidden with no edit to the guard", () => {
    const files = [
      { file: "app/src/a.ts", src: 'if (c.type === "acmegraph") return;' },
      { file: "app/src/b.tsx", src: "<p>Connect your Acme Graph DB</p>" },
      { file: "component/src/c.ts", src: 'const schemes = ["acme+s:"];' },
      {
        file: "component/src/d.ts",
        src: 'const language = ["cypher", "sql"];',
      },
    ];
    expect(
      findOffenders({ names: forbiddenNames(getAllConnectors()), files }),
    ).toEqual({});

    registerConnector(fixture);
    try {
      expect(
        findOffenders({ names: forbiddenNames(getAllConnectors()), files }),
      ).toEqual({
        "app/src/a.ts": 1,
        "app/src/b.tsx": 1,
        "component/src/c.ts": 1,
      });
    } finally {
      unregisterConnector(fixture.type);
    }
  });

  it("forbids an option prefix only when it abbreviates the connector's type", () => {
    const names = forbiddenNames(
      [{ type: "postgresql", label: "PostgreSQL" }],
      [
        { type: "postgresql", key: "pgMaxPoolSize" },
        { type: "postgresql", key: "sslMode" },
        { type: "postgresql", key: "maxPoolSize" },
      ],
    );
    const files = [
      {
        file: "app/src/a.ts",
        src: "opts.pgMaxPoolSize ?? opts.pgIdleTimeoutMillis",
      },
      {
        file: "app/src/b.ts",
        src: 'accept: ".jpg"; opts.sslMode; opts.maxPoolSize; upgrade()',
      },
    ];
    expect(findOffenders({ names, files })).toEqual({ "app/src/a.ts": 2 });
  });

  it("allows library names that merely contain a connector's name", () => {
    const names = forbiddenNames(getAllConnectors());
    const src = [
      'import { InteractiveNvlWrapper } from "@neo4j-nvl/react";',
      'import { cypher } from "@neo4j-cypher/react-codemirror";',
      'const { sql, PostgreSQL } = await import("@codemirror/lang-sql");',
      "sql({ dialect: PostgreSQL });",
    ].join("\n");
    expect(
      findOffenders({ names, files: [{ file: "component/src/x.ts", src }] }),
    ).toEqual({});
    // …and nothing wider than that: the same word on its own still offends.
    expect(
      findOffenders({
        names,
        files: [{ file: "component/src/x.ts", src: 'label = "PostgreSQL"' }],
      }),
    ).toEqual({ "component/src/x.ts": 1 });
  });

  it("refuses to run against an empty registry", () => {
    expect(() => forbiddenNames([])).toThrow(/forbid nothing/);
  });

  it("a planted connector-named export fails the export-surface guard", () => {
    // The public name is what counts: `X as Options` exports `Options`, and a
    // non-exported local is nobody's surface.
    const src = [
      'export { AcmeGraphSchemaManager, registerConnector } from "./registry";',
      'export type { AcmegraphAdvancedOptions as Options, ConnectorPlugin } from "./types";',
      "export const acmeFormFields = [];",
      "export function detectAcmeErrorType() {}",
      "export interface AcmeGraphRow {}",
      "const acmeInternal = 1;",
    ].join("\n");
    const found = exportOffenders(forbiddenNames([fixture]), [
      { file: "pkg/index.ts", src },
    ]);
    expect(Object.keys(found)).toEqual([
      "pkg/index.ts::AcmeGraphSchemaManager",
      "pkg/index.ts::acmeFormFields",
      "pkg/index.ts::detectAcmeErrorType",
      "pkg/index.ts::AcmeGraphRow",
    ]);
    expect(baselineDrift(found, {})).toHaveLength(4);
  });

  it("refuses an `export *`, which would hide names from the guard", () => {
    expect(() => exportedNames("index.ts", 'export * from "./acme";')).toThrow(
      /export \*/,
    );
  });

  it("a baseline entry that no longer offends fails", () => {
    expect(baselineDrift({}, { "app/src/fixed.ts": 3 })).toEqual([
      expect.stringMatching(/app\/src\/fixed\.ts.*found 0.*delete the entry/),
    ]);
    expect(
      baselineDrift({ "app/src/better.ts": 1 }, { "app/src/better.ts": 3 }),
    ).toEqual([expect.stringMatching(/lower the entry to 1/)]);
  });

  it("a file that offends more than its baseline entry fails, and an exact match passes", () => {
    expect(baselineDrift({ "app/src/a.ts": 4 }, { "app/src/a.ts": 3 })).toEqual(
      [expect.stringMatching(/4×, baseline allows 3/)],
    );
    expect(baselineDrift({ "app/src/a.ts": 3 }, { "app/src/a.ts": 3 })).toEqual(
      [],
    );
  });
});
