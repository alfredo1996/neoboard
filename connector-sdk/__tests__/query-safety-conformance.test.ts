import { buildConformanceCases } from "../src/conformance/query-safety";
import {
  DEFAULT_CONNECTION_CONFIG,
  QueryStatus,
} from "../src/generalized/interfaces";
import type {
  ConnectionConfig,
  QueryParams,
  QueryCallback,
} from "../src/generalized/interfaces";
import type { ConnectionModule } from "../src/generalized/ConnectionModule";

/**
 * The harness's own negative controls (#1631).
 *
 * `query-safety.ts` is the contract every connector runs to prove it honours
 * the Query Safety rules, and it had no test of its own — so nothing checked
 * that its cases reject anything. They did not, quite: the row-limit case had
 * only an upper bound, so a connector returning ONE row, ZERO rows, or a
 * non-array while flagging COMPLETE_TRUNCATED was conformant by it.
 *
 * Each fake below violates exactly one rule. A case that stops rejecting its
 * fake has stopped being a contract.
 */

type Behaviour = {
  rows?: (n: number) => unknown;
  statuses?: QueryStatus[];
  fail?: boolean;
  /** Catch the consumer's onSuccess throw and route it to onFail — the #1642 defect. */
  catchOnSuccess?: boolean;
};

/** A connector that does whatever `behaviour` says, and nothing else. */
function fakeModule(behaviour: Behaviour): ConnectionModule {
  return {
    runQuery: async (
      query: QueryParams,
      callbacks: QueryCallback<unknown>,
      config: ConnectionConfig,
    ) => {
      for (const s of behaviour.statuses ?? [QueryStatus.COMPLETE]) {
        callbacks.setStatus?.(s);
      }
      if (behaviour.fail) {
        callbacks.onFail?.(new Error("nope") as never);
        return;
      }
      const limit = config.rowLimit ?? 0;
      const payload = behaviour.rows ? behaviour.rows(limit) : [];
      if (behaviour.catchOnSuccess) {
        try {
          callbacks.onSuccess?.(payload);
        } catch (e) {
          callbacks.setStatus?.(QueryStatus.ERROR);
          callbacks.onFail?.(e as never);
        }
        return;
      }
      callbacks.onSuccess?.(payload);
    },
  } as unknown as ConnectionModule;
}

const setup = {
  baseConfig: {} as ConnectionConfig,
  queries: {
    write: { query: "CREATE (n)" },
    manyRows: (n: number) => ({ query: `RETURN range(1, ${n})` }),
    slow: { query: "CALL apoc.util.sleep(5000)" },
  },
};

const caseNamed = (module: ConnectionModule, needle: string) => {
  const found = buildConformanceCases(() => module, setup).find((c) =>
    c.name.includes(needle),
  );
  if (!found) throw new Error(`no conformance case matching "${needle}"`);
  return found;
};

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ i }));

describe("query-safety conformance harness", () => {
  it("registers exactly the five documented cases", () => {
    // A case-count guard: deleting one left both connector suites green at
    // two tests each, with nothing to say a rule had stopped being checked.
    const names = buildConformanceCases(() => fakeModule({}), setup).map(
      (c) => c.name,
    );
    expect(names).toEqual([
      "rejects a write query under READ access mode",
      "caps results at rowLimit and flags truncation (MAX_ROWS+1)",
      "honors the driver-level timeout",
      "bounds a slow query when timeout is unset",
      "does not report a throwing onSuccess as a query failure",
    ]);
  });

  describe("onSuccess isolation (#1642)", () => {
    it("rejects a connector that routes a throwing onSuccess to onFail", async () => {
      const c = caseNamed(
        fakeModule({ catchOnSuccess: true }),
        "throwing onSuccess",
      );
      await expect(c.run()).rejects.toThrow(/onSuccess isolation violation/);
    });

    it("passes a connector that lets the consumer's error propagate", async () => {
      const c = caseNamed(fakeModule({}), "throwing onSuccess");
      await expect(c.run()).resolves.toBeUndefined();
    });
  });

  describe("read-only enforcement", () => {
    it("rejects a connector that lets a write through", async () => {
      const c = caseNamed(fakeModule({}), "write query");
      await expect(c.run()).rejects.toThrow(/read-only violation/);
    });

    it("passes a connector that refuses the write", async () => {
      const c = caseNamed(fakeModule({ fail: true }), "write query");
      await expect(c.run()).resolves.toBeUndefined();
    });
  });

  describe("row limit", () => {
    const truncated = [QueryStatus.COMPLETE_TRUNCATED];

    it("rejects a connector that returns more rows than the limit", async () => {
      const c = caseNamed(
        fakeModule({ rows: (n) => rows(n + 3), statuses: truncated }),
        "rowLimit",
      );
      await expect(c.run()).rejects.toThrow(/row-limit violation/);
    });

    it("rejects a connector that returns FEWER rows than the limit", async () => {
      // The case had only an upper bound, so one row out of fifteen passed.
      const c = caseNamed(
        fakeModule({ rows: () => rows(1), statuses: truncated }),
        "rowLimit",
      );
      await expect(c.run()).rejects.toThrow(/row-limit violation/);
    });

    it("rejects a connector that returns nothing at all", async () => {
      const c = caseNamed(
        fakeModule({ rows: () => [], statuses: truncated }),
        "rowLimit",
      );
      await expect(c.run()).rejects.toThrow(/row-limit violation/);
    });

    it("rejects a connector that returns a non-array", async () => {
      // rowCount() answers 0 for anything that is not an array, which the
      // upper bound accepted in silence.
      const c = caseNamed(
        fakeModule({ rows: () => undefined, statuses: truncated }),
        "rowLimit",
      );
      await expect(c.run()).rejects.toThrow(/row-limit violation/);
    });

    it("rejects a connector that caps but does not flag truncation", async () => {
      const c = caseNamed(
        fakeModule({ rows: (n) => rows(n), statuses: [QueryStatus.COMPLETE] }),
        "rowLimit",
      );
      await expect(c.run()).rejects.toThrow(/truncation was not flagged/);
    });

    it("passes a connector that caps at the limit and flags it", async () => {
      const c = caseNamed(
        fakeModule({ rows: (n) => rows(n), statuses: truncated }),
        "rowLimit",
      );
      await expect(c.run()).resolves.toBeUndefined();
    });
  });

  describe("timeout", () => {
    it("rejects a connector that runs a slow query to completion", async () => {
      const c = caseNamed(fakeModule({ rows: () => rows(1) }), "timeout");
      await expect(c.run()).rejects.toThrow(/timeout violation/);
    });

    it("passes a connector that times the query out", async () => {
      const c = caseNamed(
        fakeModule({ statuses: [QueryStatus.TIMED_OUT] }),
        "timeout",
      );
      await expect(c.run()).resolves.toBeUndefined();
    });
  });

  // #1302: a falsy timeout must mean the documented default, not "no bound".
  // The harness lowers the default for the one case so a slow query need not
  // outlast 30s.
  describe("timeout unset", () => {
    /** Times the query out when its effective budget is short. */
    function budgetModule(effective: (c: ConnectionConfig) => number) {
      return {
        runQuery: async (
          _q: QueryParams,
          callbacks: QueryCallback<unknown>,
          config: ConnectionConfig,
        ) => {
          const budget = effective(config);
          if (budget > 0 && budget < 5000) {
            callbacks.setStatus?.(QueryStatus.TIMED_OUT);
            return;
          }
          callbacks.setStatus?.(QueryStatus.COMPLETE);
          callbacks.onSuccess?.(rows(1));
        },
      } as unknown as ConnectionModule;
    }

    it("rejects a connector that runs unbounded when timeout is unset", async () => {
      const c = caseNamed(
        budgetModule((config) => config.timeout ?? 0),
        "timeout is unset",
      );
      await expect(c.run()).rejects.toThrow(/timeout violation/);
    });

    it("passes a connector that falls back to the default timeout", async () => {
      const c = caseNamed(
        budgetModule(
          (config) => config.timeout || DEFAULT_CONNECTION_CONFIG.timeout,
        ),
        "timeout is unset",
      );
      await expect(c.run()).resolves.toBeUndefined();
    });

    it("restores the default afterwards, even when the case fails", async () => {
      const before = DEFAULT_CONNECTION_CONFIG.timeout;
      const c = caseNamed(
        budgetModule((config) => config.timeout ?? 0),
        "timeout is unset",
      );
      await c.run().catch(() => undefined);
      expect(DEFAULT_CONNECTION_CONFIG.timeout).toBe(before);
    });
  });
});
