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
 * silently absent — and an absent table is unguarded by everything below.
 * Nothing is skipped quietly: a table name the parser cannot read throws, and
 * so does a `"tenant_id"` literal outside every `pgTable(...)` call (a spread
 * shared column, `pgTable` imported under another name), because a pin on
 * the derived map cannot notice a table that was never derived.
 */
export function tenantTablesIn(src: string): Record<string, string> {
  const sf = ts.createSourceFile("schema.ts", src, ts.ScriptTarget.Latest, true);
  const out: Record<string, string> = {};
  const tables: ts.CallExpression[] = [];
  const literals: ts.StringLiteral[] = [];
  const declaresTenant = (n: ts.Node): boolean =>
    (ts.isCallExpression(n) &&
      n.arguments.length > 0 &&
      ts.isStringLiteral(n.arguments[0]) &&
      n.arguments[0].text === "tenant_id") ||
    (ts.forEachChild(n, declaresTenant) ?? false);
  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) && n.text === "tenant_id") literals.push(n);
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "pgTable"
    ) {
      tables.push(n);
      // The export it is bound to, through any wrapper: withAudit(pgTable(…)).
      let owner: ts.Node = n.parent;
      while (!ts.isVariableDeclaration(owner) && !ts.isSourceFile(owner)) {
        owner = owner.parent;
      }
      const name = ts.isVariableDeclaration(owner)
        ? owner.name.getText(sf)
        : "an unbound pgTable";
      const [physical, columns] = n.arguments;
      if (!ts.isVariableDeclaration(owner) || !physical || !ts.isStringLiteral(physical)) {
        throw new Error(`cannot read the table name of ${name}`);
      }
      if (columns && declaresTenant(columns)) out[name] = physical.text;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const stray = literals.find(
    (l) => !tables.some((t) => l.pos >= t.pos && l.end <= t.end),
  );
  if (stray) {
    const line = sf.getLineAndCharacterOfPosition(stray.getStart(sf)).line + 1;
    throw new Error(
      `tenant_id outside any pgTable(...) call at schema.ts:${line}; ` +
        "teach tenantTablesIn this declaration shape",
    );
  }
  return out;
}

/**
 * Auth.js's `account` / `session` / `verificationToken` are absent by
 * construction: they have no tenant_id and are keyed by a user id that does.
 */
const TENANT_TABLES = tenantTablesIn(
  readFileSync(join(APP_SRC, "lib/db/schema.ts"), "utf8"),
);

// ─── Provenance ──────────────────────────────────────────────────────
//
// CLAUDE.md, verbatim: "Take `tenantId` from `requireSession()`, NEVER from the
// request body." A list of banned names cannot enforce that — a destructure or
// a renamed request object walks past it — so the rule is an allowlist: a
// value is credited only when it resolves, binding by binding and in its own
// scope, to one of the sources below.

/**
 * Calls whose result is the caller's own session, or the operator's configured
 * tenant (`resolveTenantId()`, the only reader of TENANT_ID — #1728).
 */
const SESSION_SOURCES = new Set(["requireSession", "requireAdmin", "resolveTenantId"]);
/** Database clients: a row they return carries the tenant it was stored with. */
const DB_CLIENTS = new Set(["db", "tx"]);
/** Next.js route handlers, whose parameters are the request itself. */
const HANDLERS = /^(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/;

/** One file under scan, bound, so an identifier resolves to its own declaration. */
interface Src {
  sf: ts.SourceFile;
  checker: ts.TypeChecker;
  /** A "use server" module: every parameter arrives from the client. */
  serverActions: boolean;
}

function bind(file: string, src: string): Src {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const options: ts.CompilerOptions = { noLib: true, noResolve: true, types: [] };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = () => sf;
  const first = sf.statements[0];
  return {
    sf,
    checker: ts.createProgram([file], options, host).getTypeChecker(),
    serverActions:
      first !== undefined &&
      ts.isExpressionStatement(first) &&
      ts.isStringLiteral(first.expression) &&
      first.expression.text === "use server",
  };
}

/** Strip what does not change a value: parens, await, `as`, `!`, `satisfies`. */
function unwrap(n: ts.Node): ts.Node {
  let e = n;
  while (
    ts.isParenthesizedExpression(e) ||
    ts.isAwaitExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isSatisfiesExpression(e)
  ) {
    e = e.expression;
  }
  return e;
}

function declOf(id: ts.Identifier, s: Src): ts.Declaration | undefined {
  const symbol =
    ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id
      ? s.checker.getShorthandAssignmentValueSymbol(id.parent)
      : s.checker.getSymbolAtLocation(id);
  return symbol?.valueDeclaration ?? symbol?.declarations?.[0];
}

/** `const x = <this>` for a plain (non-destructured) local. */
function initializerOf(id: ts.Identifier, s: Src): ts.Expression | undefined {
  const d = declOf(id, s);
  return d && ts.isVariableDeclaration(d) ? d.initializer : undefined;
}

/** The function a call goes to, when this file declares it. */
function localFunction(
  callee: ts.Node,
  s: Src,
): ts.FunctionLikeDeclaration | undefined {
  if (!ts.isIdentifier(callee)) return undefined;
  const d = declOf(callee, s);
  if (d && ts.isFunctionDeclaration(d)) return d;
  const init = d && ts.isVariableDeclaration(d) && d.initializer && unwrap(d.initializer);
  return init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
    ? init
    : undefined;
}

/**
 * Everything a function can return; `undefined` for a bare `return;` or for
 * falling off the end of the body.
 */
function returnsOf(fn: ts.FunctionLikeDeclaration): (ts.Expression | undefined)[] {
  if (!fn.body) return [undefined];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const out: (ts.Expression | undefined)[] = [];
  const walk = (n: ts.Node): void => {
    if (ts.isReturnStatement(n)) out.push(n.expression);
    else if (!ts.isFunctionLike(n)) ts.forEachChild(n, walk);
  };
  walk(fn.body);
  const last = fn.body.statements.at(-1);
  if (!last || !ts.isReturnStatement(last)) out.push(undefined);
  return out;
}

/** Does this value trace to the session (or a stored row, or operator config)? */
function trusted(n: ts.Node, s: Src, depth = 8): boolean {
  const e = unwrap(n);
  if (depth === 0) return false;
  if (ts.isIdentifier(e)) return trustedDecl(declOf(e, s), s, depth - 1);
  if (
    ts.isBinaryExpression(e) &&
    e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    // `process.env.TENANT_ID ?? "default"` — the session's own fallback.
    return (
      trusted(e.left, s, depth - 1) &&
      (ts.isStringLiteral(e.right) || trusted(e.right, s, depth - 1))
    );
  }
  if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) {
    if (e.expression.getText(s.sf) === "process.env") return true;
    return (
      trusted(e.expression, s, depth - 1) ||
      (ts.isPropertyAccessExpression(e) && trustedReturn(e, s, depth - 1))
    );
  }
  if (ts.isCallExpression(e)) {
    let root: ts.Node = e;
    while (
      ts.isCallExpression(root) ||
      ts.isPropertyAccessExpression(root) ||
      ts.isElementAccessExpression(root)
    ) {
      root = root.expression;
    }
    return (
      ts.isIdentifier(root) &&
      (DB_CLIENTS.has(root.text) ||
        (root === e.expression && SESSION_SOURCES.has(root.text)))
    );
  }
  return false;
}

function trustedDecl(
  d: ts.Declaration | undefined,
  s: Src,
  depth: number,
): boolean {
  let p: ts.Node | undefined = d;
  while (
    p &&
    (ts.isBindingElement(p) ||
      ts.isObjectBindingPattern(p) ||
      ts.isArrayBindingPattern(p))
  ) {
    p = p.parent;
  }
  if (p && ts.isVariableDeclaration(p)) {
    return p.initializer !== undefined && trusted(p.initializer, s, depth);
  }
  if (!p || !ts.isParameter(p) || s.serverActions) return false;
  // ponytail: a named function's parameter is its caller's responsibility and
  // is credited without tracing the argument; a callback's is not (it is fed
  // by whatever calls it, a request body included), nor is a route
  // handler's. Trace call-site arguments if a helper is ever fed the body.
  const fn = p.parent;
  const name =
    ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)
      ? fn.name
      : ts.isVariableDeclaration(fn.parent)
        ? fn.parent.name
        : undefined;
  return name !== undefined && !HANDLERS.test(name.getText(s.sf));
}

/**
 * `result.session`, where `result = await guard()` and every object `guard`
 * returns with a `session` sets it from a trusted value — the
 * widget-templates `requireOwnedTemplate` shape.
 */
function trustedReturn(
  e: ts.PropertyAccessExpression,
  s: Src,
  depth: number,
): boolean {
  const target = unwrap(e.expression);
  const call = unwrap(
    (ts.isIdentifier(target) && initializerOf(target, s)) || target,
  );
  const fn = ts.isCallExpression(call) ? localFunction(call.expression, s) : undefined;
  const props = (fn ? returnsOf(fn) : []).flatMap((r) => {
    const o = r && unwrap(r);
    return o && ts.isObjectLiteralExpression(o)
      ? o.properties.filter((p) => p.name?.getText(s.sf) === e.name.text)
      : [];
  });
  return (
    props.length > 0 &&
    props.every(
      (p) =>
        (ts.isShorthandPropertyAssignment(p) && trusted(p.name, s, depth)) ||
        (ts.isPropertyAssignment(p) && trusted(p.initializer, s, depth)),
    )
  );
}

// ─── Builder predicates ──────────────────────────────────────────────

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

/**
 * Does this predicate CONSTRAIN the tenant, or merely mention it?
 *
 * Presence of the word was the original rule, and it accepted five different
 * leaks (#1626): a column compared to itself returns every tenant, `ne`
 * returns exactly the other tenants, a value read off the request body returns
 * whichever tenant the caller names, and an `or` makes the whole filter
 * optional. Each of those has a negative control in the tests below. So does
 * a branch — a ternary arm, a helper's early return — that drops the filter:
 * every branch has to carry it.
 *
 * The constrained column must belong to `table` — the outer `where` of a join
 * scopes the table it names, not the one joined to it.
 */
function constrainsTenant(
  n: ts.Node,
  table: string,
  s: Src,
  depth = 4,
): boolean {
  const e = unwrap(n);
  const sub = (x: ts.Node) => constrainsTenant(x, table, s, depth);
  const resolved = (x: ts.Node | undefined) =>
    x !== undefined && depth > 0 && constrainsTenant(x, table, s, depth - 1);

  // A raw `sql` fragment: it must compare THIS table's own column —
  // `${dashboards.tenantId} = ${tenantId}` — at its own level, on every
  // variant. A subquery's alias scopes the subquery, not this row.
  if (isSqlTag(e)) {
    return sqlVariants(e, s).every((v) => fragmentConstrains(sqlCode(v), table));
  }
  if (ts.isConditionalExpression(e)) return sub(e.whenTrue) && sub(e.whenFalse);
  if (ts.isIdentifier(e)) return resolved(initializerOf(e, s));
  if (!ts.isCallExpression(e)) return ts.forEachChild(e, sub) ?? false;

  const fn = localFunction(e.expression, s);
  if (fn) return returnsOf(fn).every(resolved);

  const name = ts.isIdentifier(e.expression) ? e.expression.text : undefined;
  // Every branch must carry it, or the filter is optional.
  if (name === "or") return e.arguments.length > 0 && e.arguments.every(sub);
  // Inverting a tenant filter selects the other tenants.
  if (name === "not") return false;
  if (name === "eq") {
    if (e.arguments.length !== 2) return false;
    const [a, b] = e.arguments;
    const colA = tenantColumnOf(a);
    const colB = tenantColumnOf(b);
    // Two columns is a tautology, not a filter.
    if (colA !== undefined && colB !== undefined) return false;
    if ((colA ?? colB) !== table) return false;
    return trusted(colA === undefined ? a : b, s);
  }
  // and(), plus any comparator we do not model: credit it only if one of
  // its arguments qualifies on its own terms.
  return e.arguments.some(sub);
}

/** An insert is scoped when its values() sets a tenantId that traces to the session. */
function valuesSetTenant(n: ts.Node, s: Src, depth = 4): boolean {
  const e = unwrap(n);
  if (ts.isShorthandPropertyAssignment(e) && e.name.text === "tenantId") {
    return trusted(e.name, s);
  }
  if (
    ts.isPropertyAssignment(e) &&
    e.name.getText(s.sf).replace(/["']/g, "") === "tenantId"
  ) {
    return trusted(e.initializer, s);
  }
  if (ts.isIdentifier(e)) {
    const init = initializerOf(e, s);
    return depth > 0 && init !== undefined && valuesSetTenant(init, s, depth - 1);
  }
  return ts.forEachChild(e, (c) => valuesSetTenant(c, s, depth) || undefined) ?? false;
}

// ─── Raw SQL ─────────────────────────────────────────────────────────
//
// Held to the same rules as the builder, read off the rendered SQL text. Every
// reference to a tenant table (each FROM/JOIN/UPDATE/INTO/USING, or comma
// join) is judged on its own: it needs `<its name>.tenant_id = <session value>`
// in the same SELECT (the same UNION branch of it), in a clause that filters
// that reference's rows, and not negated or OR-ed away. A table is scoped
// only when every reference to it is. Before #1626 one mention of tenant_id
// anywhere in a template marked every table in it scoped.
//
// ponytail: this is regex and parenthesis counting, not a SQL parser, so a
// `CASE WHEN tenant_id = …` inside a WHERE is still credited. A real parser
// is the upgrade if that shape appears.

/** A trusted value, a value that does not trace to the session, and SQL of unknown shape. */
const VALUE = "$VALUE";
const CALLER = "$CALLER";
const OPAQUE = "$OPAQUE";

const isSqlTag = (n: ts.Node): n is ts.TaggedTemplateExpression =>
  ts.isTaggedTemplateExpression(n) && n.tag.getText() === "sql";

/**
 * Every SQL text a template can render. An interpolated sql helper, local or
 * conditional is inlined once per branch, so a path that drops the filter
 * cannot hide behind the path that keeps it.
 */
function sqlVariants(
  t: ts.TaggedTemplateExpression,
  s: Src,
  depth = 3,
): string[] {
  const tpl = t.template;
  if (ts.isNoSubstitutionTemplateLiteral(tpl)) return [tpl.text];
  // ponytail: variants multiply per branching span (32 at most today); cap or
  // memoise if a template ever interpolates many branching helpers.
  let out = [tpl.head.text];
  for (const span of tpl.templateSpans) {
    const alts = renderSql(span.expression, s, depth);
    out = out.flatMap((pre) => alts.map((a) => pre + a + span.literal.text));
  }
  return out;
}

/**
 * What an interpolation renders as. A tenant table or column renders as its
 * physical name; a plain identifier or property read as a value, `$VALUE`
 * when it traces to the session and `$CALLER` when not. Anything whose SQL
 * cannot be known — `sql.raw`, `sql.join`, a call this file does not declare —
 * is `$OPAQUE`, which makes a predicate beside it optional: it could be an OR.
 */
function renderSql(n: ts.Expression, s: Src, depth: number): string[] {
  const e = unwrap(n) as ts.Expression;
  const column = tenantColumnOf(e);
  if (column !== undefined) return [`"${TENANT_TABLES[column]}".tenant_id`];
  const table = tableOf(e);
  if (table !== undefined) return [`"${TENANT_TABLES[table]}"`];
  if (isSqlTag(e)) return sqlVariants(e, s, depth);
  if (depth === 0) return [OPAQUE];
  if (ts.isConditionalExpression(e)) {
    return [
      ...renderSql(e.whenTrue, s, depth - 1),
      ...renderSql(e.whenFalse, s, depth - 1),
    ];
  }
  if (ts.isCallExpression(e)) {
    const fn = localFunction(e.expression, s);
    return fn
      ? returnsOf(fn).flatMap((r) => (r ? renderSql(r, s, depth - 1) : [OPAQUE]))
      : [OPAQUE];
  }
  const init = ts.isIdentifier(e) ? initializerOf(e, s) : undefined;
  if (init) return renderSql(init, s, depth - 1);
  // ponytail: a parameter holding a SQL fragment still renders as a value.
  if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e) || ts.isLiteralExpression(e)) {
    return [trusted(e, s) ? VALUE : CALLER];
  }
  return [OPAQUE];
}

/**
 * SQL minus what cannot constrain anything: string literals and comments. One
 * left-to-right pass, so an apostrophe inside a comment, or a comment marker
 * inside a string, is read as part of whatever it sits in.
 */
const sqlCode = (text: string) =>
  text.replace(/'(?:[^']|'')*'|--[^\n]*|\/\*[\s\S]*?\*\//g, (m) =>
    m.startsWith("'") ? "''" : " ",
  );

/** [start, end) of a SELECT, or of one UNION branch of it. */
type Span = readonly [number, number];

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

/** Blank every parenthesised group, offsets kept, leaving one level of SQL. */
function mask(text: string): string {
  let out = text;
  for (let prev = ""; prev !== out; ) {
    prev = out;
    out = out.replace(/\([^()]*\)/g, (g) => " ".repeat(g.length));
  }
  return out;
}

/** The SELECT — and the UNION/INTERSECT/EXCEPT branch of it — a position belongs to. */
function scopeOf(code: string, at: number): Span {
  let [lo, hi] = [at, at];
  for (;;) {
    const open = enclosingParen(code, lo - 1, -1);
    const close = enclosingParen(code, hi, 1);
    if (open < 0 || /^\s*(?:SELECT|WITH)\b/i.test(code.slice(open + 1))) {
      let start = open + 1;
      for (const m of mask(code.slice(start, close)).matchAll(
        /\b(?:UNION|INTERSECT|EXCEPT)\b/gi,
      )) {
        const i = open + 1 + m.index;
        if (i >= at) return [start, i];
        start = i + m[0].length;
      }
      return [start, close];
    }
    [lo, hi] = [open, close + 1];
  }
}

/** A tenant table as one statement names it: where, under what name, in which SELECT. */
interface Ref {
  table: string;
  at: number;
  name: string;
  scope: Span;
}

/** Words that can follow a table reference without being its alias. */
const NOT_ALIAS =
  "WHERE|ON|JOIN|INNER|LEFT|RIGHT|FULL|CROSS|NATURAL|SET|USING|GROUP|ORDER|" +
  "LIMIT|OFFSET|RETURNING|UNION|INTERSECT|EXCEPT|HAVING|WINDOW|FOR|VALUES|" +
  "SELECT|DEFAULT|LATERAL";

function sqlRefs(code: string): Ref[] {
  return Object.entries(TENANT_TABLES).flatMap(([table, physical]) =>
    [
      ...code.matchAll(
        new RegExp(
          `(?:\\b(?:FROM|JOIN|UPDATE|INTO|USING)\\s+|,\\s*)(?:"?public"?\\.)?"?${physical}"?(?![\\w"])` +
            `(?:\\s+(?:AS\\s+)?(?!(?:${NOT_ALIAS})\\b)(\\w+))?`,
          "gi",
        ),
      ),
    ].map((m) => ({
      table,
      at: m.index,
      name: m[1] ?? physical,
      scope: scopeOf(code, m.index),
    })),
  );
}

/** SQL clause keywords; the last one before a predicate says what it does. */
const CLAUSE =
  /\b(WHERE|ON|HAVING|SET|SELECT|FROM|VALUES|RETURNING|ORDER|GROUP|LIMIT)\b/gi;
const FILTERS = new Set(["WHERE", "ON", "HAVING"]);
const JOIN_KEYWORD = /\b(?:(LEFT|RIGHT|FULL|INNER|CROSS)\s+)?(?:OUTER\s+)?JOIN\b/gi;

/** `[<qualifier>.]tenant_id = $VALUE`, schema-qualified or not. */
const PREDICATE = /(?<![\w."])((?:(?:\w+|"\w+")\.)*)"?tenant_id"?\s*=\s*\$VALUE\b/g;

interface Predicate {
  /** The name it qualifies the column with; undefined when bare. */
  qualifier: string | undefined;
  /** The clause keyword it sits under, and the level that keyword is on. */
  clause: { name: string; at: number; level: number } | undefined;
  scope: Span;
}

/** Every tenant predicate in the SQL that actually filters. */
function predicatesIn(code: string): Predicate[] {
  return [...code.matchAll(PREDICATE)].flatMap((m) => {
    const where = filterAt(code, m.index, m.index + m[0].length);
    const qualifier = m[1] ? m[1].split(".").at(-2)?.replaceAll('"', "") : undefined;
    return where ? [{ ...where, qualifier }] : [];
  });
}

/**
 * Where does the predicate at [from, to) filter, if it does? Not when it sits
 * in a SET list or a projection rather than WHERE/ON/HAVING, when it is
 * negated, or when it is OR-ed — or placed beside SQL of unknown shape — at
 * its own level or an enclosing one, up to the SELECT it belongs to. Past that
 * SELECT it is a subquery, and the outer OR decides whether the subquery
 * matters, not which tenant it reads.
 */
function filterAt(
  code: string,
  from: number,
  to: number,
): Omit<Predicate, "qualifier"> | undefined {
  if (/\bNOT\s*$/i.test(code.slice(0, from))) return undefined;
  const scope = scopeOf(code, from);
  let [lo, hi] = [from, to];
  let clause: Predicate["clause"];
  for (;;) {
    const open = enclosingParen(code, lo - 1, -1);
    const atScope = open < scope[0];
    const [start, end] = atScope ? scope : [open + 1, enclosingParen(code, hi, 1)];
    const before = mask(code.slice(start, lo));
    const keyword = [...before.matchAll(CLAUSE)].pop();
    clause ??= keyword && {
      name: keyword[1].toUpperCase(),
      at: start + keyword.index,
      level: start,
    };
    if (/\bOR\b|\$OPAQUE\b/i.test(`${before} ${mask(code.slice(hi, end))}`)) {
      return undefined;
    }
    if (atScope) {
      return clause === undefined || FILTERS.has(clause.name)
        ? { clause, scope }
        : undefined;
    }
    if (/\bNOT\s*$/i.test(code.slice(0, open))) return undefined;
    [lo, hi] = [open, end + 1];
  }
}

/**
 * Does predicate `p` fix `ref`'s rows to one tenant? Same SELECT, the
 * reference's own name (bare only when it is the one tenant table there), and
 * a clause that filters it: an ON filters the rows its join brings in — both
 * sides for an inner join, the joined table for a LEFT, the preserved-against
 * side for a RIGHT, neither for a FULL.
 */
function credits(code: string, ref: Ref, p: Predicate, refs: Ref[]): boolean {
  const sameScope = (r: { scope: Span }) =>
    r.scope[0] === ref.scope[0] && r.scope[1] === ref.scope[1];
  if (!sameScope(p)) return false;
  const named =
    p.qualifier === undefined
      ? refs.filter(sameScope).length === 1
      : p.qualifier === ref.name;
  if (!named || p.clause?.name !== "ON") return named;
  const join = [
    ...mask(code.slice(p.clause.level, p.clause.at)).matchAll(JOIN_KEYWORD),
  ].pop();
  if (!join) return false;
  const joinAt = p.clause.level + join.index + join[0].length - "JOIN".length;
  switch (join[1]?.toUpperCase()) {
    case "LEFT":
      return ref.at === joinAt;
    case "RIGHT":
      return ref.at < joinAt;
    case "FULL":
      return false;
    default:
      return ref.at < p.clause.at;
  }
}

/** Per tenant table in one rendered statement: is every reference to it scoped? */
function rawVerdicts(code: string): Map<string, boolean> {
  const refs = sqlRefs(code);
  const predicates = predicatesIn(code);
  const out = new Map<string, boolean>();
  for (const ref of refs) {
    const scoped = predicates.some((p) => credits(code, ref, p, refs));
    out.set(ref.table, (out.get(ref.table) ?? true) && scoped);
  }
  return out;
}

/** A builder fragment scopes `table` by `"<table>".tenant_id = $VALUE` at its own top level. */
function fragmentConstrains(code: string, table: string): boolean {
  return predicatesIn(code).some(
    (p) => p.scope[0] === 0 && p.qualifier === TENANT_TABLES[table],
  );
}

/** Join methods that can bring a tenant table in → does their ON filter its rows? */
const JOINS = new Map([
  ["innerJoin", true],
  ["leftJoin", true],
  ["rightJoin", false],
  ["fullJoin", false],
]);

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
  // Sign-in's fire-and-forget lastLoginAt bump. It carries no tenant
  // predicate: before #1626 the scanner credited it only because it pasted
  // the text of `user`'s initializer, a tenant-scoped lookup, into the where.
  "lib/auth/config.ts::users::update": {
    count: 1,
    reason:
      "keys off users.id of the row the tenant-scoped credentials lookup " +
      "just returned",
  },
};

// ─── Scanner ─────────────────────────────────────────────────────────

const BUILDERS = new Set(["from", "insert", "update", "delete"]);

/**
 * Find every query against a tenant-scoped table in one source file and
 * decide whether its predicate constrains the tenant.
 *
 * Exported so the tests below can run it against inline fixtures — a
 * scanner that silently matches nothing would otherwise "pass" forever.
 */
export function scanSource(file: string, src: string): Hit[] {
  const s = bind(file, src);
  const { sf } = s;
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
      const predicates: ts.Node[] = [];
      const joins: { table: string; on?: ts.Node; filters: boolean; line: number }[] = [];
      const findClauses = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
          const method = n.expression.name.text;
          if (method === gate) predicates.push(...n.arguments);
          // Every tenant table joined into this statement is its own query
          // surface. These produced no Hit at all before #1626 — not an
          // unscoped Hit, none — so 8 live joins were invisible to the guard.
          const joined = JOINS.has(method) ? tableOf(n.arguments[0]) : undefined;
          if (joined !== undefined) {
            joins.push({
              table: joined,
              on: n.arguments[1],
              filters: JOINS.get(method) === true,
              line: at(n),
            });
          }
        }
        ts.forEachChild(n, findClauses);
      };
      findClauses(top);

      hits.push({
        file,
        line: at(node),
        table,
        kind,
        scoped: predicates.some((p) =>
          kind === "insert"
            ? valuesSetTenant(p, s)
            : constrainsTenant(p, table, s),
        ),
        snippet: brief(top.getText(sf)),
      });

      for (const j of joins) {
        // Either the join's own on-clause filters it, or the statement's
        // where does — for that table, not merely for the one it hangs off.
        hits.push({
          file,
          line: j.line,
          table: j.table,
          kind: "join",
          scoped:
            (j.filters && j.on !== undefined && constrainsTenant(j.on, j.table, s)) ||
            predicates.some((p) => constrainsTenant(p, j.table, s)),
          snippet: brief(j.on?.getText(sf) ?? ""),
        });
      }
    }

    // ── Raw SQL: db.execute(sql`… FROM "dashboard" …`)
    // The builder scan cannot see these, and lib/db/connection-*.ts are
    // written entirely in raw SQL. One Hit per table, and a table is scoped
    // only if every variant of the template that touches it constrains it.
    if (isSqlTag(node)) {
      const variants = sqlVariants(node, s).map((v) => rawVerdicts(sqlCode(v)));
      const touched = new Set(variants.flatMap((v) => [...v.keys()]));
      for (const name of touched) {
        hits.push({
          file,
          line: at(node),
          table: name,
          kind: "raw",
          scoped: variants.every((v) => v.get(name) ?? true),
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
  /** Every positive fixture binds the tenant the way routes do: off the session. */
  const SESSION = "const { tenantId } = await requireSession();";
  const wrap = (body: string) =>
    `import { db } from "@/lib/db";\nimport { dashboards } from "@/lib/db/schema";\n${SESSION}\n${body}`;

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

  it("rejects a builder predicate with a branch that drops the filter", () => {
    const scoped = "and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId))";
    for (const [label, prelude, where] of [
      ["ternary", "", `isAdmin ? eq(dashboards.id, id) : ${scoped}`],
      [
        "helper with an early return",
        `function scope(a) { if (a) return eq(dashboards.id, id); return ${scoped}; }`,
        "scope(isAdmin)",
      ],
      [
        "sql helper with an early return",
        "function s(a) { if (a) return sql`TRUE`; return sql`${dashboards.tenantId} = ${tenantId}`; }",
        "sql`${s(isAdmin)}`",
      ],
    ]) {
      const [hit] = scanSource(
        "f.ts",
        wrap(`${prelude}\nawait db.select().from(dashboards).where(${where});`),
      );
      expect(hit.scoped, label).toBe(false);
    }
  });

  it("accepts a builder predicate whose every branch carries the filter", () => {
    const scoped = "and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId))";
    for (const [label, prelude, where] of [
      ["ternary", "", `isAdmin ? eq(dashboards.tenantId, tenantId) : ${scoped}`],
      [
        "helper",
        `function scope(a) { if (a) return eq(dashboards.tenantId, tenantId); return ${scoped}; }`,
        "scope(isAdmin)",
      ],
    ]) {
      const [hit] = scanSource(
        "f.ts",
        wrap(`${prelude}\nawait db.select().from(dashboards).where(${where});`),
      );
      expect(hit.scoped, label).toBe(true);
    }
  });

  it("sees a JOIN onto a tenant table at all", () => {
    // Not "joins are allowlisted" — joins produced no Hit whatsoever, so the
    // 8 live joins in app/src were invisible to the only cross-tenant guard.
    const hits = scanSource(
      "f.ts",
      `import { db } from "@/lib/db";
       import { dashboards, users } from "@/lib/db/schema";
       ${SESSION}
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

  it("credits a join's on-clause only where it filters the joined table", () => {
    // A left/inner join's ON filters the rows it brings in; a right or full
    // join preserves every row of the joined table whatever the ON says.
    for (const [join, scoped] of [
      ["innerJoin", true],
      ["leftJoin", true],
      ["rightJoin", false],
      ["fullJoin", false],
    ] as const) {
      const hits = scanSource(
        "f.ts",
        `import { db } from "@/lib/db";
         import { dashboards, users } from "@/lib/db/schema";
         ${SESSION}
         const r = await db.select().from(dashboards)
           .${join}(users, and(eq(dashboards.updatedBy, users.id), eq(users.tenantId, tenantId)))
           .where(eq(dashboards.tenantId, tenantId));`,
      );
      expect(hits.find((h) => h.table === "users")?.scoped, join).toBe(scoped);
    }
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
      `${SESSION}
       function scope() { return sql\`d.tenant_id = \${tenantId}\`; }
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
         ${SESSION}
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

  it("does not credit a builder sql fragment whose own-table predicate sits in a subquery", () => {
    const [outer] = scanSource(
      "f.ts",
      wrap(
        `const r = await db.select().from(dashboards).where(
           sql\`EXISTS (SELECT 1 FROM "dashboard" WHERE \${dashboards.tenantId} = \${tenantId})\`);`,
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

  // ── Provenance: the value must trace to the session ─────────────────────
  //
  // Not "the value is not called body": a destructure, a renamed request
  // object or a same-named local in another handler all dodge a list of
  // banned names. Only a binding that resolves to the session is credited.

  describe("tenant value provenance", () => {
    const raw = 'await db.execute(sql`SELECT id FROM "dashboard" d WHERE d.tenant_id = ${tenantId}`);';
    const builder = "await db.select().from(dashboards).where(eq(dashboards.tenantId, tenantId));";
    // No import prelude: a "use server" directive only counts as the first statement.
    const scan = (src: string) =>
      scanSource("f.ts", src)
        .filter((h) => h.table === "dashboards")
        .map((h) => h.scoped);

    it("rejects a tenant value that does not trace to the session", () => {
      for (const [label, src] of [
        ["destructured from the body, raw", `export async function POST(req) { const body = await req.json(); const { tenantId } = body; ${raw} }`],
        ["destructured from req.json(), builder", `export async function POST(req) { const { tenantId } = await req.json(); ${builder} }`],
        ["property of a renamed body, raw", 'export async function POST(req) { const data = await req.json(); await db.execute(sql`SELECT id FROM "dashboard" d WHERE d.tenant_id = ${data.tenantId}`); }'],
        ["renamed request object", "export async function PUT(r) { const b = await r.json(); await db.select().from(dashboards).where(eq(dashboards.tenantId, b.tenantId)); }"],
        ["a route handler's own parameter", `export const DELETE = async (tenantId) => { ${builder} };`],
        ["a callback's parameter", "await Promise.all(items.map((tenantId) => db.select().from(dashboards).where(eq(dashboards.tenantId, tenantId))));"],
        ["a server action's parameter", `"use server";\nexport async function save(tenantId) { ${builder} }`],
        ["destructured from the body, insert", "export async function POST(req) { const { tenantId } = await req.json(); await db.insert(dashboards).values({ name, tenantId }); }"],
        ["bound nowhere", builder],
      ]) {
        expect(scan(src), label).toEqual([false]);
      }
    });

    it("resolves each binding in its own scope, not by name across the file", () => {
      expect(
        scan(`
          export async function GET(req) {
            const body = await req.json();
            const tenantId = body.tenantId;
            ${builder}
          }
          export async function POST() {
            const session = await requireSession();
            const tenantId = session.tenantId;
            ${builder}
          }`),
      ).toEqual([false, true]);
    });

    it("accepts the session bindings the codebase writes", () => {
      for (const [label, src] of [
        ["destructured requireSession()", `const { tenantId } = await requireSession(); ${raw} ${builder}`],
        ["destructured requireAdmin()", `const { tenantId } = await requireAdmin(); ${raw} ${builder}`],
        ["renamed destructure", "const { tenantId: sessionTenantId } = await requireSession(); await db.select().from(dashboards).where(eq(dashboards.tenantId, sessionTenantId));"],
        ["session.tenantId through a local", `const session = await requireSession(); const tenantId = session.tenantId; ${raw} ${builder}`],
        [
          "session returned by a local guard",
          `async function owned() { const session = await requireSession(); if (x) return { error: 1 }; return { template, session }; }
           export async function DELETE() { const result = await owned(); const { tenantId } = result.session; ${builder} }`,
        ],
        ["a library helper's parameter", `export async function usage(tenantId: string) { ${raw} ${builder} }`],
        ["a row fetched from the database", "const [row] = await db.select().from(users); await db.insert(dashboards).values({ tenantId: row.tenantId });"],
        ["operator config", "const tenantId = resolveTenantId(); await db.insert(dashboards).values({ tenantId });"],
      ]) {
        expect(scan(src).every(Boolean), label).toBe(true);
      }
    });
  });

  // ── Raw SQL: the same rules as the builder, one verdict per reference ─────

  describe("raw SQL", () => {
    const run = (body: string, prelude = SESSION) =>
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

    it("judges every reference to a table in its own SELECT, not the first one scoped", () => {
      for (const body of [
        // A UNION branch that reads every tenant.
        'SELECT id FROM "dashboard" d WHERE d.tenant_id = ${tenantId} UNION ALL SELECT id FROM "dashboard" x',
        // The same alias in both branches: only the branch split separates them.
        'SELECT id FROM "dashboard" d WHERE d.tenant_id = ${tenantId} UNION ALL SELECT id FROM "dashboard" d',
        // A scalar subquery counting across tenants.
        'SELECT (SELECT count(*) FROM "dashboard") AS total FROM "dashboard" d WHERE d.tenant_id = ${tenantId}',
        // A CTE over every tenant's rows.
        'WITH a AS (SELECT * FROM "dashboard") SELECT 1 FROM a JOIN "dashboard" d ON d.id = a.id WHERE d.tenant_id = ${tenantId}',
        // An alias reused by a subquery over another table.
        'SELECT id FROM "dashboard" x WHERE x.id IN (SELECT s."dashboardId" FROM "dashboard_share" x WHERE x.tenant_id = ${tenantId})',
      ]) {
        expect(verdicts(run(body), "dashboards"), body).toEqual([false]);
      }
      expect(
        verdicts(
          run(
            'SELECT id FROM "dashboard" d WHERE d.tenant_id = ${tenantId} UNION SELECT id FROM "dashboard" x WHERE x.tenant_id = ${tenantId}',
          ),
          "dashboards",
        ),
      ).toEqual([true]);
    });

    it("credits an ON predicate only for the rows that join actually filters", () => {
      const on = (kind: string) =>
        run(
          `SELECT 1 FROM "dashboard" d ${kind} "connection" c ON c.id = d."connectionId" AND d.tenant_id = \${tenantId} AND c.tenant_id = \${tenantId}`,
        );
      for (const [kind, dashboards, connections] of [
        ["JOIN", true, true],
        ["INNER JOIN", true, true],
        // A LEFT JOIN keeps every row of the left side whatever its ON says.
        ["LEFT JOIN", false, true],
        ["LEFT OUTER JOIN", false, true],
        ["RIGHT JOIN", true, false],
        ["FULL JOIN", false, false],
      ] as const) {
        const hits = on(kind);
        expect(verdicts(hits, "dashboards"), kind).toEqual([dashboards]);
        expect(verdicts(hits, "connections"), kind).toEqual([connections]);
      }
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
        // A block comment is not a filter either.
        "d.id = ${id} /* AND d.tenant_id = ${tenantId} */",
        // An apostrophe in a comment must not swallow the OR after it.
        "d.tenant_id = ${tenantId} -- don't widen\n OR d.\"isPublic\" = 'x'",
        // A different column that merely ends in tenant_id.
        "d.parent_tenant_id = ${tenantId}",
        // What an interpolation renders is unknown, so it can carry an OR.
        "d.tenant_id = ${tenantId} ${isAdmin ? sql`OR TRUE` : sql``}",
        "d.tenant_id = ${tenantId} ${isAdmin ? sql`AND d.id = ${id}` : sql`OR TRUE`}",
        "d.tenant_id = ${sql.raw('d.tenant_id')}",
        "d.tenant_id = ${tenantId} AND ${sql.raw('TRUE OR TRUE')}",
        "d.tenant_id = ${tenantId} AND ${importedScope()}",
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
      for (const body of [
        'UPDATE "dashboard" d SET name = ${n} WHERE d.tenant_id = ${tenantId}',
        'SELECT d."userId", count(*) FROM "dashboard" d GROUP BY d."userId", d.tenant_id HAVING d.tenant_id = ${tenantId}',
      ]) {
        expect(verdicts(run(body), "dashboards"), body).toEqual([true]);
      }
    });

    it("rejects an unqualified tenant_id when two tenant tables could own it", () => {
      const hits = run(
        'SELECT 1 FROM "dashboard" d JOIN "dashboard_share" s ON s."dashboardId" = d.id WHERE tenant_id = ${tenantId}',
      );
      expect(hits.map((h) => h.scoped)).toEqual([false, false]);
    });

    it("sees every way a statement names a tenant table", () => {
      for (const [body, table] of [
        ['DELETE FROM "dashboard" d USING "dashboard_share" s WHERE s."dashboardId" = d.id AND d.tenant_id = ${tenantId}', "dashboardShares"],
        ['INSERT INTO "dashboard" (id, name) VALUES (${id}, ${n})', "dashboards"],
        ["SELECT id FROM public.dashboard WHERE id = ${id}", "dashboards"],
        ['SELECT id FROM "public"."dashboard" WHERE id = ${id}', "dashboards"],
        ["SELECT * FROM ${dashboards} WHERE ${dashboards.id} = ${id}", "dashboards"],
        ["SELECT * FROM ${schema.dashboards} WHERE id = ${id}", "dashboards"],
      ]) {
        expect(verdicts(run(body), table), body).toEqual([false]);
      }
      for (const body of [
        "SELECT id FROM public.dashboard d WHERE d.tenant_id = ${tenantId}",
        "SELECT * FROM ${dashboards} WHERE ${dashboards.tenantId} = ${tenantId}",
      ]) {
        expect(verdicts(run(body), "dashboards"), body).toEqual([true]);
      }
    });

    it("rejects a helper whose branches do not all carry the filter", () => {
      const hits = run(
        'SELECT id FROM "dashboard" d WHERE ${scope(isAdmin)}',
        `${SESSION} function scope(isAdmin) { if (isAdmin) return sql\`TRUE\`; return sql\`d.tenant_id = \${tenantId}\`; }`,
      );
      expect(verdicts(hits, "dashboards")).toEqual([false]);
    });

    it("accepts a helper where every branch carries the filter", () => {
      const hits = run(
        'SELECT id FROM "dashboard" d WHERE ${scope(isAdmin)}',
        `${SESSION} function scope(isAdmin) { if (isAdmin) return sql\`d.tenant_id = \${tenantId}\`; return sql\`d.tenant_id = \${tenantId} AND d."userId" = \${userId}\`; }`,
      );
      expect(verdicts(hits, "dashboards")).toEqual([true]);
    });

    it("inlines both branches of an interpolated conditional fragment", () => {
      const hits = run(
        'SELECT id FROM "dashboard" d WHERE d.tenant_id = ${tenantId} ${dashboardId ? sql`AND d.id = ${dashboardId}` : sql``}',
      );
      expect(verdicts(hits, "dashboards")).toEqual([true]);
    });

    it("traces the interpolated tenant value through a local", () => {
      const where = 'SELECT id FROM "dashboard" d WHERE d.tenant_id = ${tenantId}';
      expect(
        verdicts(run(where, "const tenantId = body.tenantId;"), "dashboards"),
      ).toEqual([false]);
      expect(
        verdicts(
          run(where, "const session = await requireSession(); const tenantId = session.tenantId;"),
          "dashboards",
        ),
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
          (t) => [index("tenant_id").on(t.id)],
        );
        const c = pgTable("c", (t) => ({ tenantId: t.text("tenant_id") }));
        export const d = withAudit(pgTable("d", { tenantId: text("tenant_id") }));
      `),
    ).toEqual({ a: "a", c: "c", d: "d" });
  });

  it("fails loudly on a table name it cannot read", () => {
    expect(() =>
      tenantTablesIn(`export const a = pgTable(NAME, { tenantId: text("tenant_id") });`),
    ).toThrow(/cannot read the table name of a/);
  });

  it("fails loudly on a tenant_id column it cannot attribute to a table", () => {
    for (const src of [
      // A shared column spread into the table.
      `const tc = { tenantId: text("tenant_id") };
       export const x = pgTable("x", { ...tc, id: text("id") });`,
      // pgTable under another name.
      `import { pgTable as table } from "drizzle-orm/pg-core";
       export const x = table("x", { tenantId: text("tenant_id") });`,
    ]) {
      expect(() => tenantTablesIn(src), src).toThrow(/tenant_id outside/);
    }
  });
});
