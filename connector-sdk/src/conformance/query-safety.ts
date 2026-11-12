/**
 * Connector query-safety conformance harness (#1122).
 *
 * A reusable, framework-agnostic suite any connector runs to prove it honors
 * NeoBoard's Query Safety invariants. Each case's `run()` throws on violation,
 * so a connector wires the cases into its own jest/vitest/etc. — the SDK stays
 * free of a test-framework dependency.
 *
 * Covered:
 *  - read-only enforcement (a write query is rejected under READ access mode)
 *  - MAX_ROWS+1 capping (results capped at rowLimit, truncation flagged)
 *  - driver-level timeout (a slow query times out / fails)
 *  - named parameters (the row-limit query is bound by name, as the app
 *    sends every parameter — a connector that drops it returns no rows)
 *
 *  - cancellation (a read whose `signal` aborts settles at once, #2444; the
 *    statement is also gone from the database when the connector supplies
 *    `isQueryActive`, otherwise the case is callback-level only)
 *
 * Leak detection ("no leaked cursor after a timed-out query") isn't
 * covered here: it is connector-specific. Connectors that can observe it assert it in their own
 * teardown (the built-ins are guarded by the #978 pg-cursor timeout tests).
 */

import type { ConnectionModule } from "../generalized/ConnectionModule";
import type { ConnectionConfig, QueryParams } from "../generalized/interfaces";
import {
  DEFAULT_CONNECTION_CONFIG,
  QueryStatus,
} from "../generalized/interfaces";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls `cond` every 100 ms until it holds or `deadline` (epoch ms) passes. */
async function waitFor(
  cond: () => Promise<boolean>,
  deadline: number,
): Promise<boolean> {
  if (await cond()) return true;
  if (Date.now() >= deadline) return false;
  await sleep(100);
  return waitFor(cond, deadline);
}

/** The one parameter the harness binds; `$param_rows` in the query text. */
const ROWS_PARAM = "param_rows";

export interface ConformanceQueries {
  /** A query that mutates data — must be rejected under READ access mode. */
  write: QueryParams;
  /**
   * Query text returning as many rows as its `$param_rows` parameter says,
   * e.g. `SELECT * FROM generate_series(1, $param_rows)`.
   *
   * The harness binds it BY NAME — `{ param_rows: n }` — exactly as NeoBoard
   * sends every parameter to every connector. Getting that name to the driver
   * (natively, or rewritten to whatever placeholder it binds) happens inside
   * your `runQuery`; neither the app nor this harness knows which (#1898).
   */
  manyRows: string;
  /** A query guaranteed to run longer than a short (sub-second) timeout. */
  slow: QueryParams;
  /**
   * The query the cancellation case aborts (#2444). It must keep running far
   * longer than the 300 ms the harness waits before aborting, e.g. a 30 s
   * sleep. Optional: it falls back to `slow`, which then has to outlast that
   * wait too.
   */
  cancellable?: QueryParams;
  /**
   * Resolves true while the `cancellable` statement is still running on the
   * database (`pg_stat_activity`, `SHOW TRANSACTIONS`, ...). When supplied,
   * the cancellation case also fails a connector that reported failure at
   * once but left the statement running. Without it the case only proves the
   * callback and the elapsed time, so assert the database side in your own
   * test.
   */
  isQueryActive?: () => Promise<boolean>;
}

export interface ConformanceSetup {
  /**
   * Base connection config. The harness overrides accessMode / rowLimit /
   * timeout per case; everything else (database, parse flags, …) is taken
   * from here.
   */
  baseConfig: ConnectionConfig;
  queries: ConformanceQueries;
}

export interface ConformanceCase {
  name: string;
  run: () => Promise<void>;
}

interface Captured {
  data: unknown;
  error: unknown;
  statuses: QueryStatus[];
  /** When onFail fired (epoch ms), so a failure before the abort is detectable. */
  failedAt?: number;
}

/** Run one query, capturing everything the module reported through callbacks. */
async function execute(
  module: ConnectionModule,
  query: QueryParams,
  config: ConnectionConfig,
): Promise<Captured> {
  const captured: Captured = {
    data: undefined,
    error: undefined,
    statuses: [],
  };
  await module.runQuery(
    query,
    {
      onSuccess: (r) => {
        captured.data = r;
      },
      onFail: (e) => {
        captured.error = e;
        captured.failedAt = Date.now();
      },
      setStatus: (s) => {
        captured.statuses.push(s);
      },
    },
    config,
  );
  return captured;
}

/**
 * Build the query-safety conformance cases for a connector. `getModule` is
 * called lazily inside each case's `run()`, so the module can be created in a
 * test's `beforeAll` (e.g. after a container starts) while the cases are still
 * registered at collection time. The caller owns the module lifecycle
 * (create before, close after).
 */
export function buildConformanceCases(
  getModule: () => ConnectionModule,
  setup: ConformanceSetup,
): ConformanceCase[] {
  const base = setup.baseConfig;
  const manyRows = (n: number): QueryParams => ({
    query: setup.queries.manyRows,
    params: { [ROWS_PARAM]: n },
  });

  return [
    {
      name: "rejects a write query under READ access mode",
      run: async () => {
        const { error, statuses } = await execute(
          getModule(),
          setup.queries.write,
          { ...base, accessMode: "READ" },
        );
        const rejected =
          error !== undefined || statuses.includes(QueryStatus.ERROR);
        if (!rejected) {
          throw new Error(
            "read-only violation: a write query was not rejected under READ access mode",
          );
        }
      },
    },
    {
      name: "caps results at rowLimit and flags truncation (MAX_ROWS+1)",
      run: async () => {
        const rowLimit = 5;
        const { data, statuses } = await execute(
          getModule(),
          manyRows(rowLimit + 10),
          { ...base, accessMode: "READ", rowLimit },
        );
        // The lower bound matters as much as the upper one. With only
        // `rows > rowLimit`, a connector that returned one row, no rows, or a
        // non-array was conformant as long as it flagged truncation — and
        // the old helper answered 0 for anything that was not an array, so
        // `data: undefined` passed in silence (#1631).
        if (!Array.isArray(data)) {
          throw new Error(
            `row-limit violation: onSuccess delivered ${
              data === undefined ? "nothing" : typeof data
            }, expected an array of ${rowLimit} rows`,
          );
        }
        const rows = data.length;
        // The query asked for rowLimit + 10, so a connector that caps
        // correctly returns exactly rowLimit — no more, and no fewer.
        if (rows !== rowLimit) {
          throw new Error(
            `row-limit violation: returned ${rows} rows, expected exactly ${rowLimit}`,
          );
        }
        if (!statuses.includes(QueryStatus.COMPLETE_TRUNCATED)) {
          throw new Error(
            "row-limit violation: truncation was not flagged (COMPLETE_TRUNCATED)",
          );
        }
      },
    },
    {
      name: "honors the driver-level timeout",
      run: async () => {
        const { error, statuses } = await execute(
          getModule(),
          setup.queries.slow,
          { ...base, accessMode: "READ", timeout: 250 },
        );
        const timedOut =
          statuses.includes(QueryStatus.TIMED_OUT) || error !== undefined;
        if (!timedOut) {
          throw new Error(
            "timeout violation: a slow query neither timed out nor failed within the configured timeout",
          );
        }
      },
    },
    {
      // A falsy timeout must mean the documented default, not "no bound"
      // (#1302). The default is lowered for this one case, so the slow query
      // need not outlast 30s; connectors must read it at call time.
      name: "bounds a slow query when timeout is unset",
      run: async () => {
        const saved = DEFAULT_CONNECTION_CONFIG.timeout;
        DEFAULT_CONNECTION_CONFIG.timeout = 250;
        let captured: Captured;
        try {
          captured = await execute(getModule(), setup.queries.slow, {
            ...base,
            accessMode: "READ",
            // What NeoBoard passes for every query without an override.
            timeout: undefined,
          });
        } finally {
          DEFAULT_CONNECTION_CONFIG.timeout = saved;
        }
        const timedOut =
          captured.statuses.includes(QueryStatus.TIMED_OUT) ||
          captured.error !== undefined;
        if (!timedOut) {
          throw new Error(
            "timeout violation: with no timeout configured, a slow query ran past the default timeout",
          );
        }
      },
    },
    {
      // An abandoned read must end on the database, not run to its timeout
      // (#2444). The query is `slow`, the timeout is long, so only the abort
      // can settle it this fast.
      name: "stops a running read when its signal aborts",
      run: async () => {
        const controller = new AbortController();
        const { isQueryActive } = setup.queries;
        let settled = false;
        const running = execute(
          getModule(),
          setup.queries.cancellable ?? setup.queries.slow,
          {
            ...base,
            accessMode: "READ",
            timeout: 30_000,
            signal: controller.signal,
          },
        ).finally(() => {
          settled = true;
        });
        // Whatever happens below, the query must not outlive the case.
        const abortAndDrain = () => {
          controller.abort();
          running.catch(() => undefined);
        };
        try {
          // Abort only a query that is demonstrably running: observed on the
          // database when the connector can say so, else 300 ms in.
          if (isQueryActive) {
            const started = await waitFor(isQueryActive, Date.now() + 5000);
            if (!started) {
              throw new Error(
                "cancel violation: the cancellable query never showed as running on the database within 5 s",
              );
            }
          } else {
            await sleep(300);
          }
          if (settled) {
            throw new Error(
              "cancel violation: the query ended before the signal aborted, so cancellation was not exercised",
            );
          }
        } catch (e) {
          abortAndDrain();
          throw e;
        }
        const abortedAt = Date.now();
        abortAndDrain();
        // Measure the shutdown from the abort, not from settlement: a connector
        // that settles late must not get a late stop accepted.
        let goneAt: number | undefined;
        const polling = isQueryActive
          ? waitFor(async () => {
              if (await isQueryActive()) return false;
              goneAt ??= Date.now();
              return true;
            }, abortedAt + 2000)
          : undefined;
        polling?.catch(() => undefined);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const captured = await Promise.race([
          running,
          new Promise<undefined>((resolve) => {
            timer = setTimeout(() => resolve(undefined), 2500);
          }),
        ]).finally(() => clearTimeout(timer));
        const elapsed = Date.now() - abortedAt;
        if (captured === undefined) {
          throw new Error(
            "cancel violation: an aborted read had not settled 2.5 s after the abort",
          );
        }
        if (captured.error === undefined) {
          throw new Error(
            `cancel violation: an aborted read settled after ${elapsed} ms with no failure; expected a failure within 2.5 s`,
          );
        }
        if (captured.failedAt !== undefined && captured.failedAt < abortedAt) {
          throw new Error(
            "cancel violation: the failure was reported before the signal aborted, so it does not certify cancellation",
          );
        }
        if (polling) {
          await polling;
          if (goneAt === undefined || goneAt > abortedAt + 2000) {
            throw new Error(
              "cancel violation: the aborted statement is still running on the database 2 s after the abort",
            );
          }
        }
      },
    },
    {
      name: "does not report a throwing onSuccess as a query failure",
      run: async () => {
        // A consumer bug inside onSuccess is the consumer's to handle. A
        // connector that catches it as its own failure rolls back committed
        // work, reports ERROR, and fires onFail after onSuccess — two
        // outcomes for one query (#1642). The contract: let it propagate.
        const consumerBug = new Error("conformance: onSuccess threw");
        let failed: unknown;
        let errorStatus = false;
        let rejectedWith: unknown = undefined;
        try {
          await getModule().runQuery(
            manyRows(1),
            {
              onSuccess: () => {
                throw consumerBug;
              },
              onFail: (e) => {
                failed = e;
              },
              setStatus: (s) => {
                if (s === QueryStatus.ERROR) errorStatus = true;
              },
            },
            { ...base, rowLimit: 1 },
          );
        } catch (e) {
          rejectedWith = e;
        }
        if (failed !== undefined || errorStatus) {
          throw new Error(
            "onSuccess isolation violation: a throwing onSuccess handler reached onFail or set ERROR",
          );
        }
        if (rejectedWith !== consumerBug) {
          throw new Error(
            "onSuccess isolation violation: runQuery must reject with the consumer's own error, unchanged",
          );
        }
      },
    },
  ];
}
