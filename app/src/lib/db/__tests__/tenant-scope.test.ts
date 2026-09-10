/**
 * Tenant-scoping guard (#1226).
 *
 * `tenant_id` is on every application table, but nothing enforces that a
 * query filters by it: `app/src/lib/db/index.ts` is a plain Drizzle client
 * with no middleware, and there is no Postgres RLS. The rule ("every query
 * carries `eq(table.tenantId, session.tenantId)`") lives only in .claude/CLAUDE.md,
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
 * Every pgTable whose columns declare `tenant_id`: Drizzle export name →
 * physical table name.
 *
 * Read with the TypeScript AST rather than a regex (#1626): the regex needed
 * a newline before the closing `);`, so a table declared on one line was
 * silently absent — and an absent table is unguarded by everything below. A
 * table name the parser cannot read throws instead of being skipped.
 */
export function tenantTablesIn(src: string): Record<string, string> {
  const sf = ts.createSourceFile("schema.ts", src, ts.ScriptTarget.Latest, true);
  const out: Record<string, string> = {};
  const declaresTenant = (n: ts.Node): boolean =>
    (ts.isCallExpression(n) &&
      n.arguments.length > 0 &&
      ts.isStringLiteral(n.arguments[0]) &&
      n.arguments[0].text === "tenant_id") ||
    (ts.forEachChild(n, declaresTenant) ?? false);
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      n.initializer.expression.getText(sf) === "pgTable"
    ) {
      const [physical, columns] = n.initializer.arguments;
      if (!physical || !ts.isStringLiteral(physical)) {
        throw new Error(`cannot read the table name of ${n.name.text}`);
      }
      if (columns && declaresTenant(columns)) out[n.name.text] = physical.text;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/**
 * Auth.js's `account` / `session` / `verificationToken` are absent by
 * construction: they have no tenant_id and are keyed by a user id that does.
 */
const TENANT_TABLES = tenantTablesIn(
  readFileSync(join(APP_SRC, "lib/db/schema.ts"), "utf8"),
);

/**
 * Where a tenant value must NOT come from. CLAUDE.md, verbatim: "Take
 * `tenantId` from `requireSession()`, NEVER from the request body."
 */
const CALLER_CONTROLLED = new Set([
  "body",
  "req",
  "request",
  "params",
  "searchParams",
  "query",
  "json",
  "input",
  "payload",
  "url",
]);

/**
 * `<tenantTable>.tenantId` — a COLUMN reference. Anything else spelled
 * `x.tenantId` is a value: `session.tenantId` is the canonical right-hand
 * side, and `row.tenantId` reads one off a row already fetched.
 */
function tenantColumnOf(n: ts.Node): string | undefined {
  return ts.isPropertyAccessExpression(n) && n.name.text === "tenantId"
    ? tableOf(n.expression)
    : undefined;
}

/**
 * `dashboards`, or a namespace import's `schema.dashboards`, → "dashboards".
 * The namespace form produced no Hit at all before #1626, and
 * lib/dev/verify-connection-hosts.ts queries through exactly that.
 */
function tableOf(n: ts.Node | undefined): string | undefined {
  const id =
    n && ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)
      ? n.name
      : n;
  return id && ts.isIdentifier(id) && Object.hasOwn(TENANT_TABLES, id.text)
    ? id.text
    : undefined;
}

/** Does this expression trace back to something the caller controls? */
function isCallerControlled(n: ts.Node): boolean {
  let root: ts.Node = n;
  while (
    ts.isPropertyAccessExpression(root) ||
    ts.isElementAccessExpression(root) ||
    ts.isCallExpression(root)
  ) {
    root = root.expression;
  }
  return ts.isIdentifier(root) && CALLER_CONTROLLED.has(root.text);
}

/**
 * Does this predicate CONSTRAIN the tenant, or merely mention it?
 *
 * Presence of the word was the original rule, and it accepted five different
 * leaks (#1626): a column compared to itself returns every tenant, `ne`
 * returns exactly the other tenants, a value read off the request body returns
 * whichever tenant the caller names, and an `or` makes the whole filter
 * optional. Each of those has a negative control in the tests below.
 *
 * `table`, when given, requires the constrained column to belong to THAT
 * table — the outer `where` of a join scopes the table it names, not the one
 * joined to it.
 */
function constrainsTenant(
  text: string,
  table: string,
  defs: Defs,
): boolean {
  const sf = ts.createSourceFile(
    "predicate.ts",
    `(${text})`,
    ts.ScriptTarget.Latest,
    true,
  );

  const qualifies = (n: ts.Node): boolean => {
    // A raw `sql` fragment inside a builder predicate: it must constrain
    // THIS table's own column — `${dashboards.tenantId} = ${tenantId}` — on
    // every branch. A subquery's alias scopes the subquery, not this row, so
    // aliases are not credited here.
    // ponytail: a subquery naming this same table by its physical name is
    // still credited; a real SQL parser is the upgrade if that shape appears.
    if (isSqlTag(n)) {
      return sqlVariants(n, defs).every((v) =>
        sqlConstrains(sqlCode(v), table, new Map()),
      );
    }

    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const fn = n.expression.text;
      // Every branch must carry it, or the filter is optional.
      if (fn === "or")
        return n.arguments.length > 0 && n.arguments.every(qualifies);
      // Inverting a tenant filter selects the other tenants.
      if (fn === "not") return false;
      if (fn === "eq") {
        if (n.arguments.length !== 2) return false;
        const [a, b] = n.arguments;
        const colA = tenantColumnOf(a);
        const colB = tenantColumnOf(b);
        // Two columns is a tautology, not a filter.
        if (colA !== undefined && colB !== undefined) return false;
        const owner = colA ?? colB;
        if (owner === undefined) return false;
        if (owner !== table) return false;
        return !isCallerControlled(colA !== undefined ? b : a);
      }
      // and(), plus any comparator we do not model: credit it only if one of
      // its arguments qualifies on its own terms.
      return n.arguments.some(qualifies);
    }
    return ts.forEachChild(n, qualifies) ?? false;
  };

  return qualifies(sf) === true;
}

/** An insert is scoped when its values() sets a tenantId it did not read off the request. */
function valuesSetTenant(text: string): boolean {
  const sf = ts.createSourceFile(
    "values.ts",
    `(${text})`,
    ts.ScriptTarget.Latest,
    true,
  );
  let ok = false;
  const walk = (n: ts.Node): void => {
    if (ts.isShorthandPropertyAssignment(n) && n.name.text === "tenantId") {
      ok = true;
    } else if (
      ts.isPropertyAssignment(n) &&
      n.name.getText(sf).replace(/["']/g, "") === "tenantId" &&
      !isCallerControlled(n.initializer)
    ) {
      ok = true;
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return ok;
}

// ─── Raw SQL ─────────────────────────────────────────────────────────
//
// Held to the same rules as the builder, read off the SQL text: each table is
// judged on its own predicate, the value must not come off the request, and
// the predicate must not be negated or OR-ed away. Before #1626 one mention of
// tenant_id anywhere in a template marked every table in it scoped.

/** Locals and helpers in the file under scan, by name: initializer or function body. */
type Defs = Map<string, ts.Node>;

const isSqlTag = (n: ts.Node): n is ts.TaggedTemplateExpression =>
  ts.isTaggedTemplateExpression(n) && n.tag.getText() === "sql";

/** The outermost `sql` templates under a node — one per branch of a helper. */
function sqlTemplatesIn(
  n: ts.Node,
  out: ts.TaggedTemplateExpression[] = [],
): ts.TaggedTemplateExpression[] {
  if (isSqlTag(n)) out.push(n);
  else ts.forEachChild(n, (c) => void sqlTemplatesIn(c, out));
  return out;
}

/**
 * Every SQL text a template can render. An interpolated sql helper or local
 * is inlined once per branch, so a helper that drops the filter on one path
 * cannot hide behind the path that keeps it. A tenant column renders as the
 * column; any other value as `$VALUE`, or `$CALLER` when it traces to the
 * request.
 */
function sqlVariants(
  t: ts.TaggedTemplateExpression,
  defs: Defs,
  depth = 3,
): string[] {
  const tpl = t.template;
  if (ts.isNoSubstitutionTemplateLiteral(tpl)) return [tpl.text];
  // ponytail: variants multiply per helper span (32 at most today); cap or
  // memoise if a template ever interpolates many branching helpers.
  let out = [tpl.head.text];
  for (const span of tpl.templateSpans) {
    const alts = renderSql(span.expression, defs, depth);
    out = out.flatMap((pre) => alts.map((a) => pre + a + span.literal.text));
  }
  return out;
}

function renderSql(e: ts.Expression, defs: Defs, depth: number): string[] {
  const column = tenantColumnOf(e);
  if (column !== undefined) return [`"${TENANT_TABLES[column]}".tenant_id`];
  if (isCallerControlled(e)) return ["$CALLER"];
  const callee = ts.isCallExpression(e) ? e.expression : e;
  const def =
    depth > 0 && ts.isIdentifier(callee) ? defs.get(callee.text) : undefined;
  if (def === undefined) return ["$VALUE"];
  const templates = sqlTemplatesIn(def);
  if (templates.length > 0)
    return templates.flatMap((x) => sqlVariants(x, defs, depth - 1));
  // `const match = helper(x)` or `const tenantId = body.tenantId`: follow it.
  return ts.isExpression(def) ? renderSql(def, defs, depth - 1) : ["$VALUE"];
}

/** SQL minus what cannot constrain anything: string literals and comments. */
const sqlCode = (text: string) =>
  text.replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, "");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Tenant tables the SQL reads or writes → every name it goes by there. */
function sqlTables(code: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const [name, physical] of Object.entries(TENANT_TABLES)) {
    const ref = new RegExp(
      `(?:\\b(?:FROM|JOIN|UPDATE|INTO|USING)|,)\\s+(?:public\\.)?"?${physical}"?(?!\\w)(?:\\s+(?:AS\\s+)?(\\w+))?`,
      "gi",
    );
    const aliases = [...code.matchAll(ref)].map((m) => m[1] ?? physical);
    if (aliases.length > 0)
      found.set(name, [physical, `"${physical}"`, ...aliases]);
  }
  return found;
}

/**
 * Does this SQL fix `table` to one tenant? `<name>.tenant_id = $VALUE`, where
 * `<name>` is how the SQL refers to that table — bare `tenant_id` only when
 * no other tenant table could own the column — and nothing around it makes it
 * optional.
 */
function sqlConstrains(
  code: string,
  table: string,
  tables: Map<string, string[]>,
): boolean {
  const physical = TENANT_TABLES[table];
  const names = tables.get(table) ?? [physical, `"${physical}"`];
  const bare = tables.size === 1 && tables.has(table) ? "?" : "";
  const predicate = new RegExp(
    `(?<![\\w."])(?:(?:${names.map(escapeRe).join("|")})\\.)${bare}"?tenant_id"?\\s*=\\s*\\$VALUE\\b`,
    "g",
  );
  return [...code.matchAll(predicate)].some(
    (m) => !isOptional(code, m.index, m.index + m[0].length),
  );
}

/** SQL clause keywords; the last one before a predicate says what it does. */
const CLAUSE =
  /\b(WHERE|ON|HAVING|SET|SELECT|FROM|VALUES|RETURNING|ORDER|GROUP|LIMIT)\b/gi;
const FILTERS = new Set(["WHERE", "ON", "HAVING"]);

/** Drop every balanced parenthesised group, leaving one level of SQL. */
function flatten(sqlText: string): string {
  let out = sqlText;
  for (let prev = ""; prev !== out; ) {
    prev = out;
    out = out.replace(/\([^()]*\)/g, "");
  }
  return out;
}

/**
 * Does the predicate at [from, to) fail to filter? It does when it sits in a
 * SET list or a projection rather than WHERE/ON/HAVING, when it is negated,
 * or when it is OR-ed with anything at its own level or an enclosing one — up
 * to the SELECT it belongs to. Past that SELECT it is a subquery, and the
 * outer OR decides whether the subquery matters, not which tenant it reads.
 */
function isOptional(code: string, from: number, to: number): boolean {
  if (/\bNOT\s*$/i.test(code.slice(0, from))) return true;
  let [innerOpen, innerClose] = [from, to - 1];
  let clause: string | undefined;
  for (;;) {
    const open = enclosingParen(code, innerOpen - 1, -1);
    const close = enclosingParen(code, innerClose + 1, 1);
    const before = flatten(code.slice(open + 1, innerOpen));
    const after = flatten(code.slice(innerClose + 1, close));
    clause ??= [...before.matchAll(CLAUSE)].pop()?.[1].toUpperCase();
    if (/\bOR\b/i.test(`${before} ${after}`)) return true;
    if (open < 0 || /^\s*SELECT\b/i.test(before)) {
      return clause !== undefined && !FILTERS.has(clause);
    }
    if (/\bNOT\s*$/i.test(code.slice(0, open))) return true;
    [innerOpen, innerClose] = [open, close];
  }
}

/** The unmatched paren walking from `i` in `step` direction; -1 or length when none. */
function enclosingParen(code: string, i: number, step: 1 | -1): number {
  const [inward, outward] = step === 1 ? ["(", ")"] : [")", "("];
  let depth = 0;
  for (; i >= 0 && i < code.length; i += step) {
    if (code[i] === inward) depth++;
    else if (code[i] === outward && depth-- === 0) return i;
  }
  return i;
}

/** Join methods that can bring a tenant table into a query. */
const JOINS = new Set(["leftJoin", "innerJoin", "rightJoin", "fullJoin"]);

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
  // ── Joins reached through a foreign key on an already-scoped row ──
  // These became visible with #1626; before it, a join produced no Hit at
  // all. In each case the outer query is tenant-scoped and `users` is
  // reached by an id stored on one of its rows, so the join cannot widen
  // the result beyond the tenant the outer where already fixed.
  //
  // The assumption is that the stored id belongs to the same tenant. That
  // holds because the column is written from a session user, but it is NOT
  // enforced by a database constraint — a composite FK on (tenant_id, id)
  // would make it structural. Tracked in #1626.
  "app/api/dashboards/route.ts::users::join": {
    count: 2,
    reason:
      "leftJoin on dashboards.updatedBy to name the last editor; the " +
      "dashboards rows are already tenant-scoped by the outer where",
  },
  "app/api/dashboards/[id]/route.ts::users::join": {
    count: 1,
    reason: "same leftJoin on updatedBy, on a single already-scoped dashboard",
  },
  "app/api/dashboards/[id]/share/route.ts::users::join": {
    count: 1,
    reason:
      "innerJoin on dashboardShares.userId to name the grantee; the shares " +
      "are already scoped to a dashboard the caller's tenant owns",
  },
  "lib/auth/api-key.ts::users::join": {
    count: 1,
    reason:
      "the authentication path itself — there is no session tenant to scope " +
      "by yet; the join resolves the owner of a unique key hash",
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
  const nodes: Defs = new Map();
  const collect = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer
    ) {
      defs.set(n.name.text, n.initializer.getText(sf));
      nodes.set(n.name.text, n.initializer);
    } else if (ts.isFunctionDeclaration(n) && n.name && n.body) {
      defs.set(n.name.text, n.body.getText(sf));
      nodes.set(n.name.text, n.body);
    }
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
    const table =
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      BUILDERS.has(node.expression.name.text) &&
      node.arguments.length === 1
        ? tableOf(node.arguments[0])
        : undefined;
    if (table !== undefined) {
      const kind = (
        (node as ts.CallExpression).expression as ts.PropertyAccessExpression
      ).name.text;

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

      const predicateText = expand(predicates.join("\n"));
      hits.push({
        file,
        line: at(node),
        table,
        kind,
        scoped:
          predicates.length > 0 &&
          (kind === "insert"
            ? valuesSetTenant(predicateText)
            : constrainsTenant(predicateText, table, nodes)),
        snippet: brief(top.getText(sf)),
      });

      // Every tenant table joined into this statement is its own query
      // surface. These produced no Hit at all before #1626 — not an unscoped
      // Hit, none — so 8 live joins were invisible to the only guard there is.
      const joins: { table: string; on: string; line: number }[] = [];
      const findJoins = (n: ts.Node): void => {
        const joined =
          ts.isCallExpression(n) &&
          ts.isPropertyAccessExpression(n.expression) &&
          JOINS.has(n.expression.name.text)
            ? tableOf(n.arguments[0])
            : undefined;
        if (joined !== undefined) {
          joins.push({
            table: joined,
            on: (n as ts.CallExpression).arguments[1]?.getText(sf) ?? "",
            line: at(n),
          });
        }
        ts.forEachChild(n, findJoins);
      };
      findJoins(top);

      for (const j of joins) {
        // Either the join's own on-clause constrains it, or the statement's
        // where does — for that table, not merely for the one it hangs off.
        hits.push({
          file,
          line: j.line,
          table: j.table,
          kind: "join",
          scoped:
            constrainsTenant(expand(j.on), j.table, nodes) ||
            constrainsTenant(predicateText, j.table, nodes),
          snippet: brief(j.on),
        });
      }
    }

    // ── Raw SQL: db.execute(sql`… FROM "dashboard" …`)
    // The builder scan cannot see these, and lib/db/connection-*.ts are
    // written entirely in raw SQL. One Hit per table, and a table is scoped
    // only if every variant of the template that touches it constrains it.
    if (isSqlTag(node)) {
      const variants = sqlVariants(node, nodes).map((v) => {
        const code = sqlCode(v);
        return { code, tables: sqlTables(code) };
      });
      const touched = new Set(variants.flatMap((v) => [...v.tables.keys()]));
      for (const name of touched) {
        hits.push({
          file,
          line: at(node),
          table: name,
          kind: "raw",
          scoped: variants.every(
            (v) => !v.tables.has(name) || sqlConstrains(v.code, name, v.tables),
          ),
          snippet: brief(node.template.getText(sf)),
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

  it("derives exactly these tenant tables from schema.ts", () => {
    // Pinned both ways: a new tenant_id table is guarded from birth (it is
    // derived, not hand-listed), and this assertion makes adding or dropping
    // one a deliberate edit rather than something the parser did quietly.
    expect(TENANT_TABLES).toEqual({
      users: "user",
      connections: "connection",
      dashboards: "dashboard",
      dashboardShares: "dashboard_share",
      widgetTemplates: "widget_template",
      apiKeys: "api_key",
      ssoProviders: "sso_provider",
      auditLogs: "audit_log",
    });
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

  // ── Predicates that MENTION the tenant and do not CONSTRAIN it ──────────
  //
  // The scanner used to ask whether the predicate text contained "tenantId".
  // Every case below contains it and leaks anyway (#1626). They are the
  // negative controls: if any of them starts passing, the guard is textual
  // again and the next cross-tenant query will ship.

  it("rejects a tautology — a column compared to itself returns every tenant", () => {
    const [hit] = scanSource(
      "f.ts",
      wrap(
        `const r = await db.select().from(dashboards)
           .where(eq(dashboards.tenantId, dashboards.tenantId));`,
      ),
    );
    expect(hit.scoped).toBe(false);
  });

  it("rejects a negated tenant filter — it returns exactly the other tenants", () => {
    const [hit] = scanSource(
      "f.ts",
      wrap(
        `const r = await db.select().from(dashboards)
           .where(ne(dashboards.tenantId, tenantId));`,
      ),
    );
    expect(hit.scoped).toBe(false);
  });

  it("rejects a tenant value taken from the request body", () => {
    // CLAUDE.md, verbatim: take tenantId from requireSession(), NEVER from
    // the request body. This is the shape that rule exists to forbid.
    for (const src of [
      "body.tenantId",
      "req.body.tenantId",
      "params.tenantId",
      "searchParams.get('tenantId')",
    ]) {
      const [hit] = scanSource(
        "f.ts",
        wrap(
          `const r = await db.select().from(dashboards)
             .where(eq(dashboards.tenantId, ${src}));`,
        ),
      );
      expect(hit.scoped, src).toBe(false);
    }
  });

  it("rejects an or() that makes the tenant filter optional", () => {
    const [hit] = scanSource(
      "f.ts",
      wrap(
        `const r = await db.select().from(dashboards)
           .where(or(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId)));`,
      ),
    );
    expect(hit.scoped).toBe(false);
  });

  it("accepts an or() where every branch carries the tenant filter", () => {
    const [hit] = scanSource(
      "f.ts",
      wrap(
        `const r = await db.select().from(dashboards)
           .where(or(
             and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId)),
             and(eq(dashboards.name, name), eq(dashboards.tenantId, tenantId)),
           ));`,
      ),
    );
    expect(hit.scoped).toBe(true);
  });

  it("sees a JOIN onto a tenant table at all", () => {
    // Not "joins are allowlisted" — joins produced no Hit whatsoever, so the
    // 8 live joins in app/src were invisible to the only cross-tenant guard.
    const hits = scanSource(
      "f.ts",
      `import { db } from "@/lib/db";
       import { dashboards, users } from "@/lib/db/schema";
       const r = await db.select().from(dashboards)
         .leftJoin(users, eq(dashboards.updatedBy, users.id))
         .where(eq(dashboards.tenantId, tenantId));`,
    );
    const join = hits.find((h) => h.table === "users");
    expect(join, "no Hit produced for the joined table").toBeDefined();
    expect(join?.kind).toBe("join");
    // The outer where scopes dashboards, not users.
    expect(join?.scoped).toBe(false);
  });

  it("accepts a join whose own on-clause carries the tenant filter", () => {
    const hits = scanSource(
      "f.ts",
      `import { db } from "@/lib/db";
       import { dashboards, users } from "@/lib/db/schema";
       const r = await db.select().from(dashboards)
         .innerJoin(users, and(eq(dashboards.updatedBy, users.id), eq(users.tenantId, tenantId)))
         .where(eq(dashboards.tenantId, tenantId));`,
    );
    expect(hits.find((h) => h.table === "users")?.scoped).toBe(true);
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

  it("sees a query on a namespace-imported table (schema.connections)", () => {
    const run = (where: string) =>
      scanSource(
        "f.ts",
        `const schema = await import("@/lib/db/schema");
         const r = await db.select().from(schema.connections).where(${where});`,
      );
    const [bad] = run("eq(schema.connections.id, id)");
    expect(bad, "no Hit produced for schema.connections").toMatchObject({
      table: "connections",
      scoped: false,
    });
    const [good] = run(
      "and(eq(schema.connections.id, id), eq(schema.connections.tenantId, tenantId))",
    );
    expect(good.scoped).toBe(true);
  });

  it("does not credit a builder sql fragment that scopes a different table", () => {
    const [outer] = scanSource(
      "f.ts",
      wrap(
        `const r = await db.select().from(dashboards).where(
           sql\`EXISTS (SELECT 1 FROM "dashboard_share" s WHERE s.tenant_id = \${tenantId})\`);`,
      ),
    );
    expect(outer).toMatchObject({ table: "dashboards", scoped: false });
  });

  it("accepts a builder sql fragment that compares the table's own tenant column", () => {
    const [hit] = scanSource(
      "f.ts",
      wrap(
        `const r = await db.select().from(dashboards)
           .where(sql\`\${dashboards.tenantId} = \${tenantId}\`);`,
      ),
    );
    expect(hit.scoped).toBe(true);
  });

  // ── Raw SQL: the same rules as the builder, one verdict per table ─────────

  describe("raw SQL", () => {
    const run = (body: string, prelude = "") =>
      scanSource("f.ts", `${prelude}\nawait db.execute(sql\`${body}\`);`);
    const verdicts = (hits: Hit[], table: string) =>
      hits.filter((h) => h.table === table).map((h) => h.scoped);

    it("judges each table on its own predicate, not the template's", () => {
      const hits = run(
        'SELECT s.role FROM "dashboard" d JOIN "dashboard_share" s ON s."dashboardId" = d.id WHERE d.tenant_id = ${tenantId}',
      );
      expect(verdicts(hits, "dashboards")).toEqual([true]);
      expect(verdicts(hits, "dashboardShares")).toEqual([false]);
    });

    it("sees a tenant table joined by a comma", () => {
      const hits = run(
        'SELECT 1 FROM "dashboard" d, "dashboard_share" s WHERE d.tenant_id = ${tenantId}',
      );
      expect(verdicts(hits, "dashboardShares")).toEqual([false]);
    });

    it("rejects predicates that mention tenant_id without constraining it", () => {
      for (const where of [
        "d.tenant_id = d.tenant_id",
        "d.tenant_id = ${dashboards.tenantId}",
        "d.tenant_id <> ${tenantId}",
        "d.tenant_id != ${tenantId}",
        "NOT d.tenant_id = ${tenantId}",
        "NOT (d.id = ${id} AND d.tenant_id = ${tenantId})",
        "d.tenant_id = ${body.tenantId}",
        "d.tenant_id = ${req.body.tenantId}",
        "d.id = ${id} OR d.tenant_id = ${tenantId}",
        "d.tenant_id = ${tenantId} AND d.id = ${id} OR d.\"isPublic\"",
        "(d.tenant_id = ${tenantId}) OR d.\"isPublic\"",
        "d.name = 'd.tenant_id = ${tenantId}'",
        "d.id = ${id} -- d.tenant_id = ${tenantId}\n",
      ]) {
        const hits = run(`SELECT id FROM "dashboard" d WHERE ${where}`);
        expect(verdicts(hits, "dashboards"), where).toEqual([false]);
      }
    });

    it("rejects a tenant_id comparison that sits outside WHERE/ON/HAVING", () => {
      for (const [body, table] of [
        // An assignment moves rows into a tenant; it filters nothing.
        ["UPDATE connection SET tenant_id = ${tenantId} WHERE id = ${id}", "connections"],
        // A projection computes a column; every tenant's rows come back.
        ['SELECT d.tenant_id = ${tenantId} AS mine FROM "dashboard" d', "dashboards"],
      ]) {
        expect(verdicts(run(body), table), body).toEqual([false]);
      }
      expect(
        verdicts(
          run('UPDATE "dashboard" d SET name = ${n} WHERE d.tenant_id = ${tenantId}'),
          "dashboards",
        ),
      ).toEqual([true]);
    });

    it("rejects an unqualified tenant_id when two tenant tables could own it", () => {
      const hits = run(
        'SELECT 1 FROM "dashboard" d JOIN "dashboard_share" s ON s."dashboardId" = d.id WHERE tenant_id = ${tenantId}',
      );
      expect(hits.map((h) => h.scoped)).toEqual([false, false]);
    });

    it("rejects a helper whose branches do not all carry the filter", () => {
      const hits = run(
        'SELECT id FROM "dashboard" d WHERE ${scope(isAdmin)}',
        "function scope(isAdmin) { if (isAdmin) return sql`TRUE`; return sql`d.tenant_id = ${tenantId}`; }",
      );
      expect(verdicts(hits, "dashboards")).toEqual([false]);
    });

    it("accepts a helper where every branch carries the filter", () => {
      const hits = run(
        'SELECT id FROM "dashboard" d WHERE ${scope(isAdmin)}',
        "function scope(isAdmin) { if (isAdmin) return sql`d.tenant_id = ${tenantId}`; return sql`d.tenant_id = ${tenantId} AND d.\"userId\" = ${userId}`; }",
      );
      expect(verdicts(hits, "dashboards")).toEqual([true]);
    });

    it("traces the interpolated tenant value through a local", () => {
      const where = 'SELECT id FROM "dashboard" d WHERE d.tenant_id = ${tenantId}';
      expect(
        verdicts(run(where, "const tenantId = body.tenantId;"), "dashboards"),
      ).toEqual([false]);
      expect(
        verdicts(run(where, "const tenantId = session.tenantId;"), "dashboards"),
      ).toEqual([true]);
    });

    it("accepts the shapes the codebase actually writes", () => {
      for (const body of [
        "SELECT id FROM connection WHERE tenant_id = ${tenantId}",
        'SELECT id FROM "connection" WHERE "connection"."tenant_id" = ${tenantId}',
        'DELETE FROM "connection" AS c WHERE c.id = ${id} AND c.tenant_id = ${tenantId}',
      ]) {
        expect(verdicts(run(body), "connections"), body).toEqual([true]);
      }
    });

    it("accepts an OR outside the predicate's own subquery (connection-usage shape)", () => {
      const hits = run(
        `SELECT d.id FROM "dashboard" d
         WHERE d.tenant_id = \${tenantId}
           AND (
             d."userId" = \${userId}
             OR EXISTS (
               SELECT 1 FROM "dashboard_share" s
               WHERE s."dashboardId" = d.id AND s.tenant_id = \${tenantId}
             )
             OR d."isPublic" = true
           )`,
      );
      expect(verdicts(hits, "dashboards")).toEqual([true]);
      expect(verdicts(hits, "dashboardShares")).toEqual([true]);
    });
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

describe("tenantTablesIn", () => {
  it("finds every tenant_id table, whatever its declaration shape", () => {
    // The regex this replaced needed a newline before the closing `);`, so a
    // one-line table was never listed — and an unlisted table is unguarded.
    expect(
      tenantTablesIn(`
        export const a = pgTable("a", { id: text("id"), tenantId: text("tenant_id") });
        export const b = pgTable(
          "b",
          { id: text("id") },
          (t) => [index("b_tenant_id_idx").on(t.id)],
        );
        const c = pgTable("c", (t) => ({ tenantId: t.text("tenant_id") }));
      `),
    ).toEqual({ a: "a", c: "c" });
  });

  it("fails loudly on a table name it cannot read", () => {
    expect(() =>
      tenantTablesIn(`export const a = pgTable(NAME, { tenantId: text("tenant_id") });`),
    ).toThrow(/cannot read the table name of a/);
  });
});
