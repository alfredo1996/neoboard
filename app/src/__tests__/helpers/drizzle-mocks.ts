/**
 * Shared Drizzle ORM query chain builder stubs for API route tests.
 *
 * These simulate the chainable API of Drizzle's select/insert/update/delete
 * builders so tests can control what the "database" returns.
 *
 * Every chain records the arguments it was handed, on `chain.calls`. Before
 * #1607 the methods discarded them (`where: () => c`), so a route that forgot
 * its tenant filter returned the same rows and every test still passed —
 * CLAUDE.md is explicit that such a filter is mandatory per query and that a
 * missing one is a cross-tenant leak the ORM will not catch. Use `sqlColumns`
 * and `sqlValues` to look inside a recorded expression.
 */

/** Arguments a chain was called with, per method. */
export interface ChainCalls {
  where: unknown[][];
  set: unknown[][];
  values: unknown[][];
  from: unknown[][];
}

function newCalls(): ChainCalls {
  return { where: [], set: [], values: [], from: [] };
}

/**
 * Column names a Drizzle `where` expression touches, e.g. `["tenant_id"]`.
 *
 * Drizzle builds a nested tree of `queryChunks`; a column reference is a chunk
 * carrying both `name` and `columnType`. Walking it is how a test asserts that
 * a handler scoped its query rather than merely calling `where` with something.
 */
export function sqlColumns(expr: unknown): string[] {
  const found: string[] = [];
  walk(expr, (node) => {
    if (typeof node.name === "string" && "columnType" in node) {
      found.push(node.name);
    }
  });
  return found;
}

/** Values bound into a Drizzle `where` expression, in the order they appear. */
export function sqlValues(expr: unknown): unknown[] {
  const found: unknown[] = [];
  walk(expr, (node) => {
    if ("encoder" in node && "value" in node) found.push(node.value);
  });
  return found;
}

function walk(
  node: unknown,
  visit: (n: Record<string, unknown>) => void,
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, visit));
    return;
  }
  const obj = node as Record<string, unknown>;
  visit(obj);
  // Only follow the chunk tree — walking every key would recurse into the
  // whole table definition each column points back at.
  walk(obj.queryChunks, visit);
}

/** Chainable select builder that resolves to `rows`. Supports from/where/innerJoin/leftJoin/limit/orderBy/offset. */
export function makeSelectChain(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  const calls = newCalls();
  const c = Object.assign(resolved, {
    calls,
    from: (...a: unknown[]) => (calls.from.push(a), c),
    where: (...a: unknown[]) => (calls.where.push(a), c),
    innerJoin: () => c,
    leftJoin: () => c,
    limit: () => c,
    orderBy: () => c,
    offset: () => c,
  });
  return c;
}

/** Chainable insert builder. Resolves `returning()` to `returning` array. Supports onConflictDoUpdate/onConflictDoNothing. */
export function makeInsertChain(returning: unknown[] = []) {
  const calls = newCalls();
  const c = {
    calls,
    values: (...a: unknown[]) => (calls.values.push(a), c),
    onConflictDoUpdate: () => c,
    onConflictDoNothing: () => c,
    returning: () => Promise.resolve(returning),
  };
  return c;
}

/** Chainable update builder type with thenable + chain methods. */
interface UpdateChain extends Promise<unknown[]> {
  calls: ChainCalls;
  set: (...a: unknown[]) => UpdateChain;
  where: (...a: unknown[]) => UpdateChain;
  returning: () => Promise<unknown[]>;
}

/** Chainable update builder. Resolves `returning()` to `returning` array. Supports `.catch()` for fire-and-forget patterns. */
export function makeUpdateChain(returning: unknown[] = []): UpdateChain {
  const resolved = Promise.resolve(returning);
  const calls = newCalls();
  const c: UpdateChain = Object.assign(resolved, {
    calls,
    set: (...a: unknown[]) => (calls.set.push(a), c),
    where: (...a: unknown[]) => (calls.where.push(a), c),
    returning: () => resolved,
  });
  return c;
}

/** Chainable delete builder. Resolves `returning()` to `returning` array, or `where()` to void. */
export function makeDeleteChain(returning?: unknown[]) {
  if (returning !== undefined) {
    const c = {
      where: () => c,
      returning: () => Promise.resolve(returning),
    };
    return c;
  }
  return { where: () => Promise.resolve() };
}
