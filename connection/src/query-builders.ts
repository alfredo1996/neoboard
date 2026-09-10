/**
 * Built-in guided query builders (#1696) — the client-safe source of truth
 * for how a `QuerySpec` becomes text in each connector's dialect.
 *
 * Imports NO database drivers, so the browser bundle can pull it via
 * `@neoboard/connection/query-builders`; the plugins re-export these as
 * their `buildQuery`, so the logic lives in exactly one place (same pattern
 * as form-fields.ts and query-languages.ts).
 *
 * Filter values are bound as `$param_<field>` driver parameters and never
 * appear in the text. `LIMIT` is a validated positive integer literal rather
 * than a parameter: the editor's preview wrapper appends its own `LIMIT 25`
 * to a Cypher query unless the text already ends in `LIMIT <digits>`.
 */

import type { BuiltQuery, QueryFilter, QuerySpec } from "@neoboard/connector-sdk";

type Dialect = {
  quote: (name: string) => string;
  /** The bare column or property reference for a field. */
  ref: (field: string) => string;
  contains: (ref: string, param: string) => string;
};

const COMPARISONS: Record<string, string> = {
  "=": "=",
  "!=": "<>",
  ">": ">",
  ">=": ">=",
  "<": "<",
  "<=": "<=",
};

/** `$param_<field>` with anything the app's token regex (`\w+`) would not take folded to `_`. */
function paramName(field: string): string {
  return "param_" + field.replaceAll(/\W/g, "_");
}

function whereClause(
  filter: QueryFilter,
  d: Dialect,
): { text: string; params: Record<string, unknown> } {
  const key = paramName(filter.field);
  const ref = d.ref(filter.field);
  let text: string;
  if (filter.op === "contains") {
    text = d.contains(ref, "$" + key);
  } else if (Object.hasOwn(COMPARISONS, filter.op)) {
    text = `${ref} ${COMPARISONS[filter.op]} $${key}`;
  } else {
    throw new Error(`Unknown filter operator: ${String(filter.op)}`);
  }
  return { text: "WHERE " + text, params: { [key]: filter.value } };
}

function limitClause(limit: number | undefined): string | undefined {
  return Number.isInteger(limit) && (limit as number) > 0
    ? `LIMIT ${limit}`
    : undefined;
}

function assemble(
  lines: (string | undefined)[],
  params: Record<string, unknown>,
): BuiltQuery {
  return { query: lines.filter(Boolean).join("\n"), params };
}

// ── Cypher ──────────────────────────────────────────────────────────────
// Labels after `:` and keys after `.` take keywords, so only a name that is
// not a plain identifier needs backticks.
const cypher: Dialect = {
  quote: (name) =>
    /^[A-Za-z_]\w*$/.test(name) ? name : "`" + name.replaceAll("`", "``") + "`",
  ref: (field) => "n." + cypher.quote(field),
  // toString on both sides: toLower rejects anything but a string, and a
  // digits-only value may arrive as a number the driver binds as Integer.
  contains: (ref, param) =>
    `toLower(toString(${ref})) CONTAINS toLower(toString(${param}))`,
};

export function buildNeo4jQuery(spec: QuerySpec): BuiltQuery {
  const where = spec.filter ? whereClause(spec.filter, cypher) : undefined;
  const returns =
    spec.fields.length === 0
      ? "RETURN n"
      : "RETURN " +
        spec.fields
          .map((f) => `${cypher.ref(f)} AS ${cypher.quote(f)}`)
          .join(", ");
  return assemble(
    [
      `MATCH (n:${cypher.quote(spec.source)})`,
      where?.text,
      returns,
      limitClause(spec.limit),
    ],
    where?.params ?? {},
  );
}

// ── SQL (PostgreSQL) ────────────────────────────────────────────────────
// ponytail: always double-quote. Correct for every name the introspection
// reports (exact case, reserved words), with no keyword list to keep in sync.
const sql: Dialect = {
  quote: (name) => '"' + name.replaceAll('"', '""') + '"',
  ref: (field) => sql.quote(field),
  contains: (ref, param) => `CAST(${ref} AS text) ILIKE '%' || ${param} || '%'`,
};

export function buildPostgresQuery(spec: QuerySpec): BuiltQuery {
  const where = spec.filter ? whereClause(spec.filter, sql) : undefined;
  const columns =
    spec.fields.length === 0 ? "*" : spec.fields.map(sql.quote).join(", ");
  return assemble(
    [
      `SELECT ${columns}`,
      `FROM ${sql.quote(spec.source)}`,
      where?.text,
      limitClause(spec.limit),
    ],
    where?.params ?? {},
  );
}

/** Builders keyed by built-in connector type — what the editor resolves on the client. */
export const CONNECTOR_QUERY_BUILDERS: Record<
  string,
  (spec: QuerySpec) => BuiltQuery
> = {
  neo4j: buildNeo4jQuery,
  postgresql: buildPostgresQuery,
};
