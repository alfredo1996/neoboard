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
 *
 * Cancellation-cleanup ("no leaked cursor after a timed-out query") isn't
 * covered here: the contract has no generic cancel API, and leak detection is
 * connector-specific. Connectors that can observe it assert it in their own
 * teardown (the built-ins are guarded by the #978 pg-cursor timeout tests).
 */

import type { ConnectionModule } from "../generalized/ConnectionModule";
import type { ConnectionConfig, QueryParams } from "../generalized/interfaces";
import { QueryStatus } from "../generalized/interfaces";

export interface ConformanceQueries {
  /** A query that mutates data — must be rejected under READ access mode. */
  write: QueryParams;
  /** A query returning strictly more than `n` rows. */
  manyRows: (n: number) => QueryParams;
  /** A query guaranteed to run longer than a short (sub-second) timeout. */
  slow: QueryParams;
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
      },
      setStatus: (s) => {
        captured.statuses.push(s);
      },
    },
    config,
  );
  return captured;
}

function rowCount(data: unknown): number {
  return Array.isArray(data) ? data.length : 0;
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
          setup.queries.manyRows(rowLimit + 10),
          { ...base, accessMode: "READ", rowLimit },
        );
        const rows = rowCount(data);
        if (rows > rowLimit) {
          throw new Error(
            `row-limit violation: returned ${rows} rows, expected at most ${rowLimit}`,
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
  ];
}
