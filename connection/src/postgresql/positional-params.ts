/**
 * Named parameters → node-pg's positional ones.
 *
 * NeoBoard sends every connector the same thing: `$param_xxx` tokens in the
 * query text and a `{ param_xxx: value }` map. node-pg binds only `$1, $2, …`,
 * so each token is swapped for its position and the values are returned in
 * that order, to travel BESIDE the text. A value never enters the text, and
 * nothing but a `$param_xxx` token is touched — the user's own `$1`, a
 * dollar-quoted body and everything else reach the driver as written. This is
 * the outbound mirror of `neo4j/coerce-params.ts`; it lived in the app until
 * #1898, which meant the app knew which connector it was talking to.
 *
 * Throws when the query references a parameter the map does not carry. Binding
 * `undefined` instead — as this did until #1516 — made node-pg send NULL, and
 * `LIMIT NULL` is *no limit*: the query succeeded and returned the wrong rows
 * with nothing to signal it. Neo4j already rejects an unbound parameter, so
 * throwing here also makes the two connectors behave the same way. The message
 * names parameters, never values.
 *
 * `Object.hasOwn`, not a truthiness check: an explicit `null` is a legitimate
 * value to bind, and it is precisely the case `undefined` could not express.
 */
export function toPositionalParams(
  query: string,
  params: Record<string, unknown>,
): { text: string; values: unknown[] } {
  const positions = new Map<string, number>();
  const values: unknown[] = [];
  const missing: string[] = [];

  // `\w+` is greedy, so `$param_x_max` is one token, never `$param_x` + `_max`.
  const text = query.replaceAll(/\$(param_\w+)/g, (_token, name: string) => {
    let position = positions.get(name);
    if (position === undefined) {
      if (!Object.hasOwn(params, name)) missing.push(name);
      position = values.push(params[name]);
      positions.set(name, position);
    }
    return `$${position}`;
  });

  if (missing.length > 0) {
    throw new Error(`Expected parameter(s): ${missing.join(", ")}`);
  }
  return { text, values };
}
