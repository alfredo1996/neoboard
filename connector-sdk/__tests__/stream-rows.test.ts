import {
  collectUpToLimit,
  drainRetainingUpTo,
} from "../src/generalized/stream-rows";

/**
 * Builds an async iterable that yields `total` numbers (1..total) and records
 * how many were actually pulled and whether the consumer cleaned up early
 * (i.e. called the iterator's `return()` by breaking out of `for await`).
 */
function countingSource(total: number) {
  const state = { pulled: 0, returned: false };
  const iterable: AsyncIterable<number> = {
    [Symbol.asyncIterator](): AsyncIterator<number> {
      let i = 0;
      return {
        async next() {
          if (i >= total) return { done: true, value: undefined };
          i += 1;
          state.pulled += 1;
          return { done: false, value: i };
        },
        async return() {
          state.returned = true;
          return { done: true, value: undefined };
        },
      };
    },
  };
  return { iterable, state };
}

describe("collectUpToLimit", () => {
  it("returns all rows and truncated=false when fewer than the limit", async () => {
    const { iterable, state } = countingSource(3);

    const { rows, truncated } = await collectUpToLimit(iterable, 10);

    expect(rows).toEqual([1, 2, 3]);
    expect(truncated).toBe(false);
    // Drains the source (3 rows) and finds it exhausted — no phantom extra row.
    expect(state.pulled).toBe(3);
  });

  it("returns all rows and truncated=false when exactly at the limit", async () => {
    const { iterable, state } = countingSource(5);

    const { rows, truncated } = await collectUpToLimit(iterable, 5);

    expect(rows).toHaveLength(5);
    expect(truncated).toBe(false);
    // Pulls one past the limit (the 6th pull) to confirm the source is exhausted.
    expect(state.pulled).toBe(5);
  });

  it("stops at rowLimit+1 and reports truncation when the source is larger", async () => {
    const { iterable, state } = countingSource(100_000);

    const { rows, truncated } = await collectUpToLimit(iterable, 10);

    expect(rows).toHaveLength(10);
    expect(rows[0]).toBe(1);
    expect(rows[9]).toBe(10);
    expect(truncated).toBe(true);
    // Memory-bounded: never materialises more than rowLimit + 1 rows, even
    // though the source could yield 100k. This is the whole point of the fix.
    expect(state.pulled).toBe(11);
  });

  it("closes the underlying iterator (cursor/stream) when stopping early", async () => {
    const { iterable, state } = countingSource(100);

    await collectUpToLimit(iterable, 5);

    // Breaking out of `for await` must invoke return() so pg-cursor / the
    // Neo4j Result release their server-side resources promptly.
    expect(state.returned).toBe(true);
  });

  it("handles an empty source", async () => {
    const { iterable } = countingSource(0);

    const { rows, truncated } = await collectUpToLimit(iterable, 10);

    expect(rows).toEqual([]);
    expect(truncated).toBe(false);
  });
});

describe("drainRetainingUpTo (#1298)", () => {
  it("pulls EVERY row even when far beyond the limit", async () => {
    const { iterable, state } = countingSource(1000);

    const { rows, truncated } = await drainRetainingUpTo(iterable, 10);

    // The whole point: a write's side effects only execute for rows that are
    // actually pulled. Stopping early leaves a partially-applied transaction.
    expect(state.pulled).toBe(1000);
    expect(rows).toHaveLength(10);
    expect(truncated).toBe(true);
  });

  it("retains only the first rowLimit rows, in order", async () => {
    const { iterable } = countingSource(50);

    const { rows } = await drainRetainingUpTo(iterable, 3);

    expect(rows).toEqual([1, 2, 3]);
  });

  it("returns everything and truncated=false when under the limit", async () => {
    const { iterable, state } = countingSource(4);

    const { rows, truncated } = await drainRetainingUpTo(iterable, 10);

    expect(rows).toEqual([1, 2, 3, 4]);
    expect(truncated).toBe(false);
    expect(state.pulled).toBe(4);
  });

  it("drains without retaining anything when rowLimit is 0", async () => {
    const { iterable, state } = countingSource(25);

    const { rows, truncated } = await drainRetainingUpTo(iterable, 0);

    expect(rows).toEqual([]);
    expect(truncated).toBe(true);
    expect(state.pulled).toBe(25);
  });

  it("does not abandon the source early, unlike collectUpToLimit", async () => {
    const drained = countingSource(100);
    const collected = countingSource(100);

    await drainRetainingUpTo(drained.iterable, 5);
    await collectUpToLimit(collected.iterable, 5);

    expect(drained.state.pulled).toBe(100);
    expect(drained.state.returned).toBe(false);
    expect(collected.state.pulled).toBe(6);
    expect(collected.state.returned).toBe(true);
  });
});
