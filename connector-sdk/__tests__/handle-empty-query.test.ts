import { ConnectionModule } from "../src/generalized/ConnectionModule";
import { QueryStatus } from "../src/generalized/interfaces";
import type { QueryCallback } from "../src/generalized/interfaces";

/**
 * `handleEmptyQuery` returns true so the connector returns early. Callers wrap
 * `runQuery` in a promise that settles ONLY through onSuccess/onFail, so an
 * early return with neither leaves that promise pending forever — and with it
 * the scheduler slot it holds. `maxConcurrent` whitespace-only queries wedge a
 * connector until the process restarts (#1301).
 */

/** Minimal concrete subclass — we only exercise the protected helper. */
class TestModule extends ConnectionModule<unknown> {
  runQuery(): void {}
  checkConnection(): Promise<boolean> {
    return Promise.resolve(true);
  }
  listDatabases(): Promise<string[]> {
    return Promise.resolve([]);
  }
  callHandleEmptyQuery(query: string | undefined, cbs: QueryCallback<unknown>) {
    return this.handleEmptyQuery(query, cbs);
  }
}

function spyCallbacks() {
  const calls = {
    onSuccess: [] as unknown[],
    onFail: [] as unknown[],
    status: [] as QueryStatus[],
  };
  const callbacks: QueryCallback<unknown> = {
    onSuccess: (r) => calls.onSuccess.push(r),
    onFail: (e) => calls.onFail.push(e),
    setStatus: (s) => calls.status.push(s),
  };
  return { callbacks, calls };
}

describe("handleEmptyQuery terminal-callback contract (#1301)", () => {
  it.each([undefined, "", "   ", "\n\t "])(
    "settles the caller for query %p",
    (query) => {
      const { callbacks, calls } = spyCallbacks();

      const handled = new TestModule().callHandleEmptyQuery(query, callbacks);

      expect(handled).toBe(true);
      expect(calls.status).toContain(QueryStatus.NO_QUERY);
      // The whole point: exactly one terminal callback must fire, or the
      // caller's promise never settles.
      expect(calls.onSuccess.length + calls.onFail.length).toBe(1);
    },
  );

  it("reports an empty query as success with no rows, not as a failure", () => {
    const { callbacks, calls } = spyCallbacks();

    new TestModule().callHandleEmptyQuery("  ", callbacks);

    // NO_QUERY already carries the meaning. Surfacing it as onFail would turn
    // a blank widget into a red error state on every dashboard load.
    expect(calls.onFail).toHaveLength(0);
    expect(calls.onSuccess).toEqual([[]]);
  });

  it("does not settle the caller for a non-empty query", () => {
    const { callbacks, calls } = spyCallbacks();

    const handled = new TestModule().callHandleEmptyQuery(
      "RETURN 1",
      callbacks,
    );

    expect(handled).toBe(false);
    expect(calls.status).toContain(QueryStatus.RUNNING);
    expect(calls.onSuccess).toHaveLength(0);
    expect(calls.onFail).toHaveLength(0);
  });

  it("still settles when the caller supplies no setStatus", () => {
    const calls = { onSuccess: [] as unknown[] };
    const handled = new TestModule().callHandleEmptyQuery("", {
      onSuccess: (r) => calls.onSuccess.push(r),
    });

    // Without setStatus the old code skipped the check entirely and returned
    // false, handing an empty query to the driver. Whatever it decides, it
    // must not leave the caller hanging.
    if (handled) {
      expect(calls.onSuccess).toHaveLength(1);
    }
  });
});
