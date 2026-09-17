import { DIALECT_LEXICON, maskNonCode, type SqlDialect } from "./lexer";

const PLACEHOLDER: Record<SqlDialect, (slot: number) => string> = {
  postgres: (slot) => `$${slot}`,
  mysql: () => "?",
  mssql: (slot) => `@p${slot}`,
};

/**
 * Rewrites `$param_name` tokens into `dialect`'s placeholders — `$1`
 * (postgres), `?` (mysql), `@p1` (mssql) — and returns the values in binding
 * order. Tokens inside string literals, quoted identifiers and comments stay as
 * written. Values are only ever bound, never written into the query text.
 *
 * `?` is positional, so a name used twice binds its value twice; `$n` and
 * `@pn` name a slot, so a repeated name reuses it. For mssql, bind `values[i]`
 * as `p${i + 1}`.
 *
 * Throws when the query references a parameter `params` does not carry: a
 * missing value must not bind as NULL (#1516). An explicit `null` binds.
 */
export function bindNamedParams(
  query: string,
  params: Record<string, unknown>,
  dialect: SqlDialect,
): { query: string; values: unknown[] } {
  // Unterminated literal: rewrite the raw text; the server reports the syntax error.
  const code = maskNonCode(query, DIALECT_LEXICON[dialect]) ?? query;
  const slots = new Map<string, string>();
  const values: unknown[] = [];
  const missing = new Set<string>();
  let rewritten = "";
  let copied = 0;

  for (const token of code.matchAll(/\$param_\w+/g)) {
    const name = token[0].slice(1);
    if (!Object.hasOwn(params, name)) missing.add(name);
    let placeholder = slots.get(name);
    if (placeholder === undefined) {
      values.push(params[name]);
      placeholder = PLACEHOLDER[dialect](values.length);
      if (dialect !== "mysql") slots.set(name, placeholder);
    }
    rewritten += query.slice(copied, token.index) + placeholder;
    copied = token.index + token[0].length;
  }

  if (missing.size > 0) {
    throw new Error(`Expected parameter(s): ${[...missing].join(", ")}`);
  }
  return { query: rewritten + query.slice(copied), values };
}
