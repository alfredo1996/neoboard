/**
 * Shared Drizzle ORM query chain builder stubs for API route tests.
 *
 * These simulate the chainable API of Drizzle's select/insert/update/delete
 * builders so tests can control what the "database" returns.
 */

/** Chainable select builder that resolves to `rows`. Supports from/where/innerJoin/leftJoin/limit. */
export function makeSelectChain(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  const c = Object.assign(resolved, {
    from: () => c,
    where: () => c,
    innerJoin: () => c,
    leftJoin: () => c,
    limit: () => Promise.resolve(rows),
  });
  return c;
}

/** Chainable insert builder. Resolves `returning()` to `returning` array. */
export function makeInsertChain(returning: unknown[] = []) {
  const c = {
    values: () => c,
    returning: () => Promise.resolve(returning),
  };
  return c;
}

/** Chainable update builder type with thenable + chain methods. */
interface UpdateChain extends Promise<unknown[]> {
  set: () => UpdateChain;
  where: () => UpdateChain;
  returning: () => Promise<unknown[]>;
}

/** Chainable update builder. Resolves `returning()` to `returning` array. Supports `.catch()` for fire-and-forget patterns. */
export function makeUpdateChain(returning: unknown[] = []): UpdateChain {
  const resolved = Promise.resolve(returning);
  const c: UpdateChain = Object.assign(resolved, {
    set: () => c,
    where: () => c,
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
