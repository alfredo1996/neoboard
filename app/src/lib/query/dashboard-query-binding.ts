/**
 * Dashboard query binding (#972).
 *
 * A viewer of a shared/public dashboard gets query access to that
 * dashboard's connection — but only for the queries the dashboard actually
 * contains, each where the dashboard runs it: on its widget's connection, with
 * the database that widget saves (#1822). Widget clients send their stored
 * query templates and databases verbatim (parameter values travel separately
 * through native driver binding), so binding is an exact match against the
 * saved layout, not a fuzzy/wildcard comparison.
 *
 * Edit-level users (dashboard owner, editor shares, connection owners,
 * admins) are NOT bound — authoring widgets requires running novel queries.
 */

import { seedQueriesOf } from "@/lib/widget/seed-queries";

interface LayoutWidget {
  connectionId: string;
  query?: unknown;
  database?: string;
  settings?: Record<string, unknown>;
}

interface LayoutPage {
  widgets?: LayoutWidget[];
}

interface Layout {
  pages?: LayoutPage[];
}

/** A query as a dashboard runs it, or as a request asks to run it. */
export interface LayoutQuery {
  connectionId: string;
  query: string;
  /** The per-card database. Missing or "" is the connection's default. */
  database?: string;
}

/**
 * What binding compares: connection, query and database (#1822).
 *
 * The query compares exactly as saved, whitespace and line breaks included:
 * clients send the saved text verbatim, and the route runs the text a request
 * sends.
 *
 * A missing and an empty database are one key: the query route applies no
 * override for either. Names otherwise compare exactly, since clients send the
 * saved name verbatim. A connector may resolve two spellings to one database
 * (some compare database names case-insensitively) but never two equal
 * names to different ones, so an
 * exact match can refuse a request, never widen one. Naming the connection's
 * default explicitly is an override like any other: without a configured name
 * the driver picks the default, and the route cannot know which.
 */
export function layoutQueryKey({
  connectionId,
  query,
  database,
}: LayoutQuery): string {
  return JSON.stringify([connectionId, query, database || null]);
}

/**
 * Every query a dashboard can legitimately execute, as `layoutQueryKey`s: the
 * widget queries plus the seed queries of parameter selectors and form fields,
 * across all pages, each on its widget's saved database. A card sends that
 * database with every request it makes (#1824).
 */
export function collectLayoutQueries(layout: unknown): Set<string> {
  const queries = new Set<string>();
  const pages = (layout as Layout | null)?.pages;
  if (!Array.isArray(pages)) return queries;
  for (const page of pages) {
    if (!Array.isArray(page?.widgets)) continue;
    for (const widget of page.widgets) {
      for (const query of [widget?.query, ...seedQueriesOf(widget?.settings)]) {
        if (typeof query === "string" && query.trim()) {
          queries.add(
            layoutQueryKey({
              connectionId: widget.connectionId,
              query,
              database: widget.database,
            }),
          );
        }
      }
    }
  }
  return queries;
}

/**
 * True when one of the layouts runs the requested query on the requested
 * connection and database.
 */
export function layoutsAllowQuery(
  layouts: unknown[],
  request: LayoutQuery,
): boolean {
  const key = layoutQueryKey(request);
  return layouts.some((layout) => collectLayoutQueries(layout).has(key));
}
