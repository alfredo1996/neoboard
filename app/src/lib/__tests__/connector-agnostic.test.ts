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
 * Both began as shrinking ratchets over a recorded baseline, which started at
 * 297 names in 71 files and 10 exports. The epic drove it to zero and #1905
 * deleted it: there is no baseline to raise any more. What remains is the
 * permanent allowlist below, each entry carrying the reason it is not
 * connector knowledge.
 *
 * If this fails on your change, the fix is to read the fact off the connector
 * (the registry / descriptor, server-side). Widening the allowlist is for a
 * name that genuinely is not a connector fact, and it needs its reason.
 */
import { describe, it, expect } from "vitest";
import {
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
  type ConnectorDescriptor,
  type ConnectorField,
  type ConnectorPlugin,
} from "@neoboard/connection";

const ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);

// ─── Permanent allowlist ─────────────────────────────────────────────
//
// The only names the guard lets through. Query-language names (`cypher`,
// `sql`) need no entry: a language is not a connector, and no connector is
// registered under one.

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
  {
    prefix: "app/src/lib/dev/",
    reason:
      "dev-only helpers, imported only under NODE_ENV=development and never " +
      "shipped behaviour; rewriting the seeded containers' URIs is their subject (#1905)",
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

/**
 * Statements about NeoBoard's OWN metadata store, outside `app/src/lib/db/`.
 * Blanked before counting, like `LIBRARY_NAMES`. Each pattern is one sentence,
 * never a word, so the same file naming a connector anywhere else still fails.
 */
const OWN_INFRASTRUCTURE: { pattern: RegExp; reason: string }[] = [
  {
    pattern:
      /\bPostgres requires DISTINCT ON to match the leading ORDER BY columns\b/g,
    reason:
      "the dashboards list queries the app's own metadata store; DISTINCT ON " +
      "is that store's dialect rule, and the comment is why the query is shaped so (#1905)",
  },
];

// ─── Names, derived ──────────────────────────────────────────────────

/**
 * What the guard reads off a connector — all of it descriptor data (#1897):
 * its identity, and from its `fields` the URI schemes (`protocols` of a `uri`
 * field) and the config keys it declares.
 */
type Named = Pick<ConnectorDescriptor, "type" | "label"> & {
  fields?: Pick<ConnectorField, "key" | "type" | "protocols">[];
};

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
 * `optionKeys` are the config keys a connector declares in its `fields`. When
 * a key's prefix abbreviates the connector's type (`pgMaxPoolSize`), that
 * prefix is forbidden as `\bpg[A-Z]` — case-sensitively, or `jpg` would
 * offend. The built-ins' keys are unprefixed since #1897, so today this
 * derives nothing; it is here for the connector that spells one that way.
 *
 * ponytail: schemes match as substrings. A connector registering a generic
 * scheme (`https:`) would forbid every URL; narrow the scheme rule to
 * `scheme:` / `"scheme"` the day one does.
 */
export function forbiddenNames(
  connectors: Named[],
  optionKeys: { type: string; key: string }[] = declaredKeys(connectors),
): RegExp[] {
  const names = [
    ...new Set(
      connectors
        .flatMap((c) => [
          c.type,
          c.label,
          ...(c.fields ?? [])
            .flatMap((f) => (f.type === "uri" ? (f.protocols ?? []) : []))
            .map((p) => p.split(/[+:]/)[0]),
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
 * The config keys each connector declares, straight from its descriptor. They
 * used to be scraped from the built-ins' source (`advancedOptions.pgMaxPoolSize`
 * under every `connection/src/<dir>/plugin.ts`); since #1897 a connector
 * declares its keys in `fields`, so they come from the registry like every
 * other name — which also covers an external connector, whose source is not
 * on disk.
 */
function declaredKeys(connectors: Named[]): { type: string; key: string }[] {
  return connectors.flatMap((c) =>
    (c.fields ?? []).map((f) => ({ type: c.type, key: f.key })),
  );
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
    const code = [...LIBRARY_NAMES, ...OWN_INFRASTRUCTURE].reduce(
      (s, l) => s.replace(l.pattern, ""),
      src,
    );
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

// ─── Tests ───────────────────────────────────────────────────────────

describe("connector-agnostic guard (#1894)", () => {
  const names = forbiddenNames(getAllConnectors());
  const HOW_TO_FIX =
    "take the fact from the registry / descriptor instead of naming the connector";

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

  it("forbids every URI scheme a registered connector declares", () => {
    // Schemes are how `Postgres…` identifiers are caught (`postgres:`), and
    // they are the part that moved: from `plugin.allowedProtocols` to the
    // `protocols` of the descriptor's `uri` field (#1897). A guard still
    // reading the old place derives no scheme and says nothing — it just
    // reports every `bolt` in the tree as progress. Hence the floor.
    const protocols = getAllConnectors().flatMap((c) =>
      c.fields.flatMap((f) => (f.type === "uri" ? (f.protocols ?? []) : [])),
    );
    expect(protocols.length).toBeGreaterThan(0);
    for (const protocol of protocols) {
      const files = [
        { file: "app/src/z.ts", src: `const u = "${protocol}//host";` },
      ];
      expect(findOffenders({ names, files }), protocol).toEqual({
        "app/src/z.ts": 1,
      });
    }
  });

  it("app/ and component/ name no connector", () => {
    const files = readTree(ROOT, ["app/src", "component/src"]);
    // A floor: a walker that finds no files would pass as "no offenders".
    expect(files.length).toBeGreaterThan(300);
    expect(findOffenders({ names, files }), HOW_TO_FIX).toEqual({});
  });

  it("connection and connector-sdk export no connector-named identifier", () => {
    const actual = exportOffenders(
      names,
      PUBLIC_ENTRY_POINTS.map((file) => ({
        file,
        src: readFileSync(join(ROOT, file), "utf8"),
      })),
    );
    expect(actual, HOW_TO_FIX).toEqual({});
  });
});

describe("the guards themselves", () => {
  const fixture: ConnectorPlugin = {
    type: "acmegraph",
    label: "Acme Graph DB",
    category: "database",
    fields: [
      {
        key: "uri",
        label: "URI",
        type: "uri",
        group: "connection",
        protocols: ["acme:", "acme+s:"],
      },
      // `ag` abbreviates `acmegraph`, the way `pg` abbreviated `postgresql`.
      { key: "agPoolSize", label: "Pool", type: "number", group: "advanced" },
      {
        key: "maxRetries",
        label: "Retries",
        type: "number",
        group: "advanced",
      },
    ],
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
      // Its declared config keys: the abbreviating prefix offends, the rest —
      // and the generic words a descriptor is made of — do not.
      { file: "app/src/e.ts", src: "opts.agPoolSize ?? opts.maxRetries" },
      { file: "app/src/f.ts", src: 'field.type === "uri" ? "URI" : "Pool"' },
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
        "app/src/e.ts": 1,
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
  });

  it("refuses an `export *`, which would hide names from the guard", () => {
    expect(() => exportedNames("index.ts", 'export * from "./acme";')).toThrow(
      /export \*/,
    );
  });

  // #1905 widened the permanent allowlist. Each entry has to let through what
  // it names and nothing next to it, or it becomes the permission a baseline
  // used to be.
  it("lets a dev-only helper name a connector, and nothing beside it", () => {
    const [{ type }] = getAllConnectors();
    const src = `const u = "${type}";`;
    const found = findOffenders({
      names: forbiddenNames(getAllConnectors()),
      files: [
        { file: "app/src/lib/dev/verify.ts", src },
        // A trailing slash on the prefix is what keeps these out.
        { file: "app/src/lib/devtools/x.ts", src },
        { file: "app/src/lib/dev.ts", src },
      ],
    });
    expect(found).toEqual({
      "app/src/lib/devtools/x.ts": 1,
      "app/src/lib/dev.ts": 1,
    });
  });

  it("blanks the metadata store's dialect sentence, not the file it is in", () => {
    const names = forbiddenNames(getAllConnectors());
    const [{ type }] = getAllConnectors();
    const file = "app/src/app/api/dashboards/route.ts";
    const sentence =
      "// Postgres requires DISTINCT ON to match the leading ORDER BY columns;";
    // The sentence alone is clean…
    expect(findOffenders({ names, files: [{ file, src: sentence }] })).toEqual(
      {},
    );
    // …and it exempts nothing else in the file.
    const found = findOffenders({
      names,
      files: [{ file, src: `${sentence}\nconst t = "${type}";` }],
    });
    expect(Object.keys(found)).toEqual([file]);
  });
});
