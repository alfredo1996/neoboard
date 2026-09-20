/**
 * Resolving a chart's columns by name (#1925).
 *
 * Column names are never rewritten: a query that returns `c.latitude` names
 * the column `c.latitude`, and that is what a saved styling rule, click action
 * or transform matches against. So the charts that guess which column means
 * what have to cope with the qualifier themselves.
 *
 * They did not. `map/transform.ts` matched the last segment; everything else
 * anchored against the whole key, so `RETURN m.title, m.released` — which
 * `app/e2e/charts.spec.ts` exercises — matched nothing and fell back to
 * column position. This is the map's rule, moved out to where every chart can
 * use it.
 *
 * Nothing changes for an unqualified column: a key with no dot IS its own bare
 * name, so an existing dashboard resolves exactly as it did.
 */

/**
 * The column name without its qualifier: `c.latitude` is `latitude`. An
 * anchored match against the whole key would reject it, while a loose
 * substring match would accept `c.population` for `population` — matching the
 * last segment refuses both.
 */
export function bareName(key: string): string {
  return key.slice(key.lastIndexOf(".") + 1);
}

/** What the column was read from: `c` in `c.latitude`, `""` when unqualified. */
export function qualifierOf(key: string): string {
  const dot = key.lastIndexOf(".");
  return dot === -1 ? "" : key.slice(0, dot);
}

/**
 * The first key whose BARE name matches `pattern`, skipping `exclude`.
 *
 * Returns the full key, never the bare name: two columns can share a bare
 * name (`a.name`, `b.name`) and collapsing them would label one row with
 * another's value.
 */
export function findColumn(
  keys: readonly string[],
  pattern: RegExp,
  exclude: readonly (string | undefined)[] = [],
): string | undefined {
  return keys.find((k) => !exclude.includes(k) && pattern.test(bareName(k)));
}
