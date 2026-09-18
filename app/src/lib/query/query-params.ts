/**
 * Rewrites `$param_xxx` named placeholders to PostgreSQL positional `$1, $2, ...`
 * parameters and builds the matching ordered values array.
 *
 * Neo4j natively supports `$param_xxx` syntax, so this is only needed for PostgreSQL.
 *
 * Throws when the query references a parameter the map does not carry. Binding
 * `undefined` instead — as this did until #1516 — made node-pg send NULL, and
 * `LIMIT NULL` is *no limit*: the query succeeded and returned the wrong rows
 * with nothing to signal it. Neo4j already rejects an unbound parameter, so
 * throwing here also makes the two connectors behave the same way.
 *
 * `Object.hasOwn`, not a truthiness check: an explicit `null` is a legitimate
 * value to bind, and it is precisely the case `undefined` could not express.
 */
export function rewriteParamsForPostgres(
  query: string,
  params: Record<string, unknown>,
): { query: string; params: Record<string, unknown> } {
  const tokenRegex = /\$param_(\w+)/g;
  const seen = new Map<string, number>();
  const values: unknown[] = [];
  const missing: string[] = [];
  let positionalIndex = 0;

  const rewritten = query.replace(tokenRegex, (token) => {
    // Re-use the same positional index if the same token appears multiple times
    if (seen.has(token)) {
      return `$${seen.get(token)}`;
    }
    positionalIndex++;
    seen.set(token, positionalIndex);

    // The param key in the map uses the full "param_xxx" form (set by extractReferencedParams)
    const paramKey = token.slice(1); // strip leading '$'
    if (!Object.hasOwn(params, paramKey)) {
      missing.push(paramKey);
    }
    values.push(params[paramKey]);
    return `$${positionalIndex}`;
  });

  if (missing.length > 0) {
    throw new Error(`Expected parameter(s): ${missing.join(", ")}`);
  }

  // Build a numeric-keyed object so Object.values() preserves insertion order
  const positionalParams: Record<string, unknown> = {};
  for (let i = 0; i < values.length; i++) {
    positionalParams[String(i)] = values[i];
  }

  return { query: rewritten, params: positionalParams };
}
