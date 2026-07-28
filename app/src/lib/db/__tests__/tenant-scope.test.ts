/**
 * Tenant-scoping guard (#1226).
 *
 * `tenant_id` is on every application table, but nothing enforces that a
 * query filters by it: `app/src/lib/db/index.ts` is a plain Drizzle client
 * with no middleware, and there is no Postgres RLS. The rule ("every query
 * carries `eq(table.tenantId, session.tenantId)`") lives only in CLAUDE.md,
 * so a handler that forgets it leaks across tenants and nothing fails.
 *
 * This test is that missing failure. It parses every file under `app/src`,
 * finds each query against a tenant-scoped table, and asserts the tenant
 * predicate is in the query's own `where()` (or `values()` for inserts).
 *
 * It is a **ratchet with an allowlist**, in the style of `openapi-drift`:
 * a handful of queries are legitimately instance-wide or are scoped
 * transitively by a session-derived primary key. Each is listed below with
 * a reason and an exact expected count, so adding a new unscoped query —
 * even in a file that already has one — fails.
 *
 * If this test fails on your new route, the fix is almost always to add the
 * filter, not to add an allowlist entry.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const APP_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Drizzle export name → physical table name, for every table carrying a
 * `tenant_id` column. Kept in sync with schema.ts by the test below.
 *
 * Auth.js's `account` / `session` / `verificationToken` are deliberately
 * absent: they have no tenant_id and are keyed by a user id that does.
 */
const TENANT_TABLES: Record<string, string> = {
  users: "user",
  connections: "connection",
  dashboards: "dashboard",
  dashboardShares: "dashboard_share",
  widgetTemplates: "widget_template",
  apiKeys: "api_key",
  ssoProviders: "sso_provider",
  auditLogs: "audit_log",
};

const TENANT_PREDICATE = /tenantId|tenant_id/;

export interface Hit {
  file: string;
  line: number;
  table: string;
  /** "from" | "insert" | "update" | "delete" | "raw" */
  kind: string;
  scoped: boolean;
  snippet: string;
}

/** `file::table::kind` — stable across edits, unlike a line number. */
const keyOf = (h: Hit) => `${h.file}::${h.table}::${h.kind}`;

/**
 * Queries that do NOT carry a tenant predicate, and why that is correct.
 * `count` is exact: a new unscoped query under the same key fails the test.
 */
const ALLOWLIST: Record<string, { count: number; reason: string }> = {
  // ── Deliberately instance-wide ────────────────────────────────────
  // Key rotation must re-encrypt every stored credential in the
  // deployment, not just the caller's tenant. Admin-gated, runs in one
  // transaction, and returns row counts only.
  "app/api/admin/rotate-key/route.ts::connections::from": {
    count: 1,
    reason: "key rotation is instance-wide by design",
  },
  "app/api/admin/rotate-key/route.ts::connections::update": {
    count: 1,
    reason: "re-encrypts each row fetched by the instance-wide select above",
  },
  "app/api/admin/rotate-key/route.ts::ssoProviders::from": {
    count: 1,
    reason: "key rotation is instance-wide by design",
  },
  "app/api/admin/rotate-key/route.ts::ssoProviders::update": {
    count: 1,
    reason: "re-encrypts each row fetched by the instance-wide select above",
  },
  // "Does ANY user exist?" — the first-admin bootstrap gate. Scoping
  // these per tenant would let every new tenant bootstrap its own admin
  // without ADMIN_BOOTSTRAP_TOKEN. Returns a count, never row data.
  "lib/auth/bootstrap.ts::users::from": {
    count: 1,
    reason: "instance-wide 'is any user present' bootstrap check",
  },
  "lib/auth/signup.ts::users::from": {
    count: 2,
    reason:
      "areUsersEmpty() + its in-transaction TOCTOU re-check; both are " +
      "instance-wide 'is any user present' gates returning a count only",
  },
  // Operator health probe: does ENCRYPTION_KEY decrypt what is stored?
  // Reads one row and returns a status enum — never the row, never the
  // plaintext. A tenant filter would make it report "no-credentials" on
  // an instance whose only credentials belong to another tenant.
  "lib/crypto/credential-health.ts::connections::raw": {
    count: 1,
    reason: "instance-wide one-row probe; returns a status enum, never data",
  },
  // The authentication boundary itself. There is no tenant context yet —
  // the tenant is DERIVED from the matched row (`tenantId: row.tenantId`).
  // `api_key.key_hash` is UNIQUE, so a match identifies exactly one row.
  "lib/auth/api-key.ts::apiKeys::from": {
    count: 1,
    reason:
      "resolves the bearer token that establishes tenantId; keyHash is unique",
  },

  // ── Scoped transitively by a session-derived primary key ──────────
  // `users.id` is the PK taken from the caller's own JWT, and a user row
  // belongs to exactly one tenant — these are self-access only. Listed
  // rather than "fixed" because adding the filter would change nothing
  // except hiding them from this guard.
  "app/api/users/me/route.ts::users::from": {
    count: 1,
    reason: "self-access by users.id from the caller's own session",
  },
  "app/api/users/me/route.ts::users::update": {
    count: 1,
    reason: "self-access by users.id from the caller's own session",
  },
  "app/api/users/me/password/route.ts::users::from": {
    count: 1,
    reason: "self-access by users.id from the caller's own session",
  },
  "app/api/users/me/password/route.ts::users::update": {
    count: 1,
    reason: "self-access by users.id from the caller's own session",
  },
  // connections.userId FKs to a per-tenant user row, and userId is the
  // caller's own — a connection in another tenant cannot match.
  "app/api/connections/[id]/test/route.ts::connections::from": {
    count: 1,
    reason: "scoped by connections.userId = caller's own session userId",
  },
  // Both operands were tenant-verified earlier in the same handler:
  // `id` via requireShareAccess() and `targetUser.id` via a tenant-scoped
  // lookup. The update then keys off the row that select returned.
  "app/api/dashboards/[id]/share/route.ts::dashboardShares::from": {
    count: 1,
    reason: "dashboardId and targetUser.id are both tenant-verified above",
  },
  "app/api/dashboards/[id]/share/route.ts::dashboardShares::update": {
    count: 1,
    reason: "keys off the row returned by the tenant-verified select above",
  },
};

// ─── Scanner ─────────────────────────────────────────────────────────

const BUILDERS = new Set(["from", "insert", "update", "delete"]);

/**
 * Find every query against a tenant-scoped table in one source file and
 * decide whether its predicate mentions the tenant.
 *
 * Exported so the tests below can run it against inline fixtures — a
 * scanner that silently matches nothing would otherwise "pass" forever.
 */
export function scanSource(file: string, src: string): Hit[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);

  // Locals and helpers get inlined before matching, so the very common
  // `const whereClause = and(..., eq(t.tenantId, tenantId)); …where(whereClause)`
  // and the raw-SQL `WHERE ${editableDashboardsScope(...)}` both resolve.
  const defs = new Map<string, string>();
  const collect = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer)
      defs.set(n.name.text, n.initializer.getText(sf));
    else if (ts.isFunctionDeclaration(n) && n.name && n.body)
      defs.set(n.name.text, n.body.getText(sf));
    ts.forEachChild(n, collect);
  };
  collect(sf);

  const expand = (text: string, depth = 3): string => {
    if (depth === 0) return text;
    let out = text;
    for (const [name, body] of defs) {
      if (
        new RegExp(`\\b${name}\\b`).test(out) &&
        !new RegExp(`\\b${name}\\b`).test(body)
      ) {
        out += "\n" + expand(body, depth - 1);
      }
    }
    return out;
  };

  const at = (n: ts.Node) =>
    sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const brief = (t: string) => t.replace(/\s+/g, " ").slice(0, 120);

  const hits: Hit[] = [];

  const visit = (node: ts.Node): void => {
    // ── Drizzle query builder: .from(t) / .insert(t) / .update(t) / .delete(t)
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      BUILDERS.has(node.expression.name.text) &&
      node.arguments.length === 1 &&
      ts.isIdentifier(node.arguments[0]) &&
      node.arguments[0].text in TENANT_TABLES
    ) {
      const kind = node.expression.name.text;
      const table = (node.arguments[0] as ts.Identifier).text;

      // Walk to the end of the method chain so `.where()` is in scope.
      let top: ts.Node = node;
      while (
        top.parent &&
        (ts.isCallExpression(top.parent) ||
          ts.isPropertyAccessExpression(top.parent) ||
          ts.isAwaitExpression(top.parent))
      ) {
        top = top.parent;
      }

      // Only the predicate counts. `tenantId` in a SELECT projection or an
      // orderBy is not a filter — an earlier draft of this scanner passed
      // lib/auth/api-key.ts for exactly that reason.
      const gate = kind === "insert" ? "values" : "where";
      const predicates: string[] = [];
      const findGate = (n: ts.Node): void => {
        if (
          ts.isCallExpression(n) &&
          ts.isPropertyAccessExpression(n.expression) &&
          n.expression.name.text === gate
        ) {
          predicates.push(n.arguments.map((a) => a.getText(sf)).join(","));
        }
        ts.forEachChild(n, findGate);
      };
      findGate(top);

      hits.push({
        file,
        line: at(node),
        table,
        kind,
        scoped:
          predicates.length > 0 &&
          TENANT_PREDICATE.test(expand(predicates.join("\n"))),
        snippet: brief(top.getText(sf)),
      });
    }

    // ── Raw SQL: db.execute(sql`… FROM "dashboard" …`)
    // The builder scan cannot see these, and lib/db/connection-*.ts are
    // written entirely in raw SQL.
    if (ts.isTaggedTemplateExpression(node) && node.tag.getText(sf) === "sql") {
      const text = node.template.getText(sf);
      for (const [name, physical] of Object.entries(TENANT_TABLES)) {
        const ref = new RegExp(
          `\\b(?:FROM|JOIN|UPDATE|INTO)\\s+"?${physical}"?(?![\\w_])`,
          "i",
        );
        if (!ref.test(text)) continue;
        hits.push({
          file,
          line: at(node),
          table: name,
          kind: "raw",
          scoped: TENANT_PREDICATE.test(expand(text)),
          snippet: brief(text),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
  return hits;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      sourceFiles(p, out);
    } else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) {
      out.push(p);
    }
  }
  return out;
}

function scanApp(): Hit[] {
  return sourceFiles(APP_SRC).flatMap((abs) => {
    const src = readFileSync(abs, "utf8");
    // Cheap prefilter: a file that never imports the schema cannot query it.
    if (!/@\/lib\/db|["'][.\w@/]*\/schema["']/.test(src)) return [];
    return scanSource(relative(APP_SRC, abs).split(sep).join("/"), src);
  });
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("tenant scoping guard (#1226)", () => {
  const hits = scanApp();
  const unscoped = hits.filter((h) => !h.scoped);

  it("scans a real query surface (the scanner itself is not silently empty)", () => {
    // If an upstream Drizzle refactor changes the builder shape, this floor
    // fails loudly instead of the guard quietly passing on zero hits.
    expect(hits.length).toBeGreaterThan(80);
    expect(hits.some((h) => h.kind === "raw")).toBe(true);
    expect(hits.filter((h) => h.scoped).length).toBeGreaterThan(70);
  });

  it("TENANT_TABLES matches the tenant_id columns in schema.ts", () => {
    const schema = readFileSync(join(APP_SRC, "lib/db/schema.ts"), "utf8");
    // Every pgTable declaring tenant_id must be listed above.
    const declared = [
      ...schema.matchAll(
        /export const (\w+) = pgTable\(\s*\n?\s*"([\w_]+)"([\s\S]*?)\n\}?\)?;/g,
      ),
    ]
      .filter((m) => m[3].includes('tenant_id"'))
      .map((m) => [m[1], m[2]] as const);

    // Exact, both ways: a new tenant_id table that nobody adds to
    // TENANT_TABLES would otherwise be invisible to this whole guard, and a
    // stale entry for a dropped table would silently narrow it.
    expect(declared.map(([n]) => n).sort()).toEqual(
      Object.keys(TENANT_TABLES).sort(),
    );
    for (const [name, physical] of declared) {
      expect(
        TENANT_TABLES[name],
        `${name} has tenant_id but is not in TENANT_TABLES`,
      ).toBe(physical);
    }
  });

  it("every query on a tenant-scoped table filters by tenant", () => {
    const offenders = unscoped
      .filter((h) => !ALLOWLIST[keyOf(h)])
      .map((h) => `${h.file}:${h.line} [${h.kind} ${h.table}]  ${h.snippet}`);

    expect(
      offenders,
      "Add eq(<table>.tenantId, session.tenantId) to the query's where(). " +
        "Only add an ALLOWLIST entry if the query is genuinely instance-wide.",
    ).toEqual([]);
  });

  it("the allowlist is exact — no drift, no stale entries", () => {
    const actual = new Map<string, number>();
    for (const h of unscoped) {
      actual.set(keyOf(h), (actual.get(keyOf(h)) ?? 0) + 1);
    }

    const drift: string[] = [];
    for (const [key, { count }] of Object.entries(ALLOWLIST)) {
      const found = actual.get(key) ?? 0;
      if (found !== count) {
        drift.push(
          found === 0
            ? `${key}: stale — now scoped, drop the entry`
            : `${key}: expected ${count} unscoped, found ${found}`,
        );
      }
    }
    expect(drift).toEqual([]);
  });
});

describe("scanSource", () => {
  const wrap = (body: string) =>
    `import { db } from "@/lib/db";\nimport { dashboards } from "@/lib/db/schema";\n${body}`;

  it("accepts a query whose where() carries the tenant filter", () => {
    const [hit] = scanSource(
      "f.ts",
      wrap(
        `const r = await db.select().from(dashboards)
           .where(and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId)));`,
      ),
    );
    expect(hit.scoped).toBe(true);
  });

  it("flags a query with no tenant filter", () => {
    const [hit] = scanSource(
      "f.ts",
      wrap(
        `const r = await db.select().from(dashboards).where(eq(dashboards.id, id));`,
      ),
    );
    expect(hit).toMatchObject({
      table: "dashboards",
      kind: "from",
      scoped: false,
    });
  });

  it("flags a query with no where() at all", () => {
    const [hit] = scanSource(
      "f.ts",
      wrap(`const r = await db.select().from(dashboards);`),
    );
    expect(hit.scoped).toBe(false);
  });

  it("does not count tenantId in a SELECT projection as a filter", () => {
    const [hit] = scanSource(
      "f.ts",
      wrap(
        `const r = await db.select({ tenantId: dashboards.tenantId })
           .from(dashboards).where(eq(dashboards.id, id));`,
      ),
    );
    expect(hit.scoped).toBe(false);
  });

  it("resolves a tenant filter held in a local where-clause variable", () => {
    const [hit] = scanSource(
      "f.ts",
      wrap(
        `const whereClause = and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId));
         const r = await db.delete(dashboards).where(whereClause);`,
      ),
    );
    expect(hit.scoped).toBe(true);
  });

  it("requires an insert to set tenantId in values()", () => {
    const [bad] = scanSource(
      "f.ts",
      wrap(`await db.insert(dashboards).values({ name });`),
    );
    expect(bad.scoped).toBe(false);
    const [good] = scanSource(
      "f.ts",
      wrap(`await db.insert(dashboards).values({ name, tenantId });`),
    );
    expect(good.scoped).toBe(true);
  });

  it("flags raw SQL against a tenant table with no tenant_id predicate", () => {
    const [hit] = scanSource(
      "f.ts",
      `await db.execute(sql\`SELECT id FROM "dashboard" WHERE name = \${n}\`);`,
    );
    expect(hit).toMatchObject({
      kind: "raw",
      table: "dashboards",
      scoped: false,
    });
  });

  it("accepts raw SQL whose tenant predicate lives in an interpolated helper", () => {
    const [hit] = scanSource(
      "f.ts",
      `function scope() { return sql\`d.tenant_id = \${tenantId}\`; }
       await db.execute(sql\`SELECT id FROM "dashboard" d WHERE \${scope()}\`);`,
    );
    expect(hit.scoped).toBe(true);
  });

  it("does not confuse dashboard_share with dashboard", () => {
    const tables = scanSource(
      "f.ts",
      `await db.execute(sql\`SELECT 1 FROM "dashboard_share" s WHERE s."userId" = \${u}\`);`,
    ).map((h) => h.table);
    expect(tables).toEqual(["dashboardShares"]);
  });

  it("ignores tables that have no tenant_id", () => {
    expect(
      scanSource(
        "f.ts",
        `await db.select().from(sessions).where(eq(sessions.id, id));`,
      ),
    ).toEqual([]);
  });
});
