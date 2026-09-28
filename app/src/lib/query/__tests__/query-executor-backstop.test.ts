import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CONNECTION_CONFIG,
  QueryStatus,
  registerConnector,
  unregisterConnector,
} from "@neoboard/connection";
import {
  nextRun,
  rows,
  scripted,
  scriptedConnector,
  SCRIPTED_TYPE,
} from "@/__tests__/fixtures/scripted-connector";
import {
  closeAllConnections,
  executeQuery,
  QUERY_DEADLINE_GRACE_MS,
  testConnection,
} from "@/lib/query/query-executor";

/**
 * The row cap and the execution timeout are the connector's to enforce. These
 * are the app's backstops for a third-party connector that gets them wrong
 * (#2060), run through the REAL executor and registry with a connector that
 * breaks its contract on demand. A compliant connector must see no change.
 */
const DEFAULT_DEADLINE =
  DEFAULT_CONNECTION_CONFIG.timeout + QUERY_DEADLINE_GRACE_MS;

/** Settles to the rejection, so a pending query never becomes an unhandled one. */
function outcome(pending: Promise<unknown>) {
  const state: { settled: boolean; value?: unknown; error?: unknown } = {
    settled: false,
  };
  pending.then(
    (value) => Object.assign(state, { settled: true, value }),
    (error) => Object.assign(state, { settled: true, error }),
  );
  return state;
}

describe("executeQuery backstops a connector that breaks its contract (#2060)", () => {
  beforeEach(() => {
    registerConnector(scriptedConnector);
    scripted.script = () => {};
    scripted.check = async () => true;
  });

  afterEach(async () => {
    vi.useRealTimers();
    await closeAllConnections();
    unregisterConnector(SCRIPTED_TYPE);
  });

  describe("rows", () => {
    it("cuts a result longer than rowLimit to rowLimit and marks it truncated", async () => {
      scripted.script = (cb, config) => {
        // Reports COMPLETE and hands back ten rows too many.
        cb.setStatus?.(QueryStatus.COMPLETE);
        cb.onSuccess?.(rows(config.rowLimit + 10));
      };

      const result = await executeQuery(
        SCRIPTED_TYPE,
        { maxRows: 5 },
        { query: "ALL" },
      );

      expect(result).toEqual({ data: rows(5), truncated: true, rowLimit: 5 });
    });

    it("cuts at the per-query rowLimit too", async () => {
      scripted.script = (cb) => cb.onSuccess?.(rows(100));

      const result = await executeQuery(
        SCRIPTED_TYPE,
        {},
        { query: "ALL" },
        { rowLimit: 25 },
      );

      expect(result).toEqual({ data: rows(25), truncated: true, rowLimit: 25 });
    });

    it.each([
      {
        name: "a full, truncated result",
        result: rows(5),
        status: QueryStatus.COMPLETE_TRUNCATED,
        truncated: true,
      },
      {
        name: "a short result",
        result: rows(2),
        status: QueryStatus.COMPLETE,
        truncated: false,
      },
      {
        name: "a result that is not a list of rows",
        result: { acknowledged: true },
        status: QueryStatus.COMPLETE,
        truncated: false,
      },
    ])(
      "leaves a compliant connector's answer alone: $name",
      async ({ result, status, truncated }) => {
        scripted.script = (cb) => {
          cb.setStatus?.(status);
          cb.onSuccess?.(result);
        };

        const answer = await executeQuery(
          SCRIPTED_TYPE,
          { maxRows: 5 },
          { query: "ALL" },
        );

        // The very value the connector handed over: not copied, not cut.
        expect(answer.data).toBe(result);
        expect(answer).toMatchObject({ truncated, rowLimit: 5 });
      },
    );
  });

  describe("time", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    it("rejects with a TIMEOUT ConnectorError at the query timeout plus grace when the connector never answers", async () => {
      const run = nextRun();
      const state = outcome(executeQuery(SCRIPTED_TYPE, {}, { query: "HANG" }));
      await run;

      await vi.advanceTimersByTimeAsync(DEFAULT_DEADLINE - 1);
      expect(state.settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(state.error).toMatchObject({
        name: "ConnectorError",
        type: "TIMEOUT",
        // Not transient: the client does not auto-retry it, so a hung
        // connector costs one slot per widget per refresh, not four (#1678).
        classification: { type: "TIMEOUT", transient: false },
      });
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([
      {
        name: "the longest duration the connection declares",
        config: { callTimeout: 90_000 },
        options: undefined,
        timeout: 90_000,
      },
      {
        name: "an explicit per-query timeout",
        config: {},
        options: { timeout: 120_000 },
        timeout: 120_000,
      },
      {
        name: "never less than the default, however short the declared one",
        config: { callTimeout: 5_000 },
        options: undefined,
        timeout: DEFAULT_CONNECTION_CONFIG.timeout,
      },
      {
        name: "a number that is not a duration does not count",
        config: { pageSize: 500_000 },
        options: undefined,
        timeout: DEFAULT_CONNECTION_CONFIG.timeout,
      },
    ])("waits for $name", async ({ config, options, timeout }) => {
      const run = nextRun();
      const state = outcome(
        executeQuery(SCRIPTED_TYPE, config, { query: "HANG" }, options),
      );
      await run;

      await vi.advanceTimersByTimeAsync(timeout + QUERY_DEADLINE_GRACE_MS - 1);
      expect(state.settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(state.error).toMatchObject({ type: "TIMEOUT" });
    });

    // Past 2^31 - 1 ms Node fires a timer after 1 ms, which would fail every
    // query on the connection at once. A field with no `max` accepts such a
    // value, so the deadline is clamped: late, never early.
    it.each([
      {
        name: "a stored duration",
        config: { callTimeout: 2_592_000_000 },
        options: undefined,
      },
      {
        name: "a per-query timeout",
        config: {},
        options: { timeout: 2_592_000_000 },
      },
    ])(
      "lets a prompt answer through when $name is past setTimeout's range",
      async ({ config, options }) => {
        scripted.script = (cb) => {
          setTimeout(() => cb.onSuccess?.(rows(1)), 50);
        };

        const state = outcome(
          executeQuery(SCRIPTED_TYPE, config, { query: "SLOW" }, options),
        );
        await vi.advanceTimersByTimeAsync(50);

        expect(state.error).toBeUndefined();
        expect(state.value).toMatchObject({ data: rows(1) });
      },
    );

    it("ignores a callback that arrives after the deadline", async () => {
      const run = nextRun();
      const pending = executeQuery(SCRIPTED_TYPE, {}, { query: "LATE" });
      const state = outcome(pending);
      const late = await run;

      await vi.advanceTimersByTimeAsync(DEFAULT_DEADLINE);
      expect(state.error).toMatchObject({ type: "TIMEOUT" });

      expect(() => {
        late.setStatus?.(QueryStatus.COMPLETE);
        late.onSuccess?.(rows(3));
        late.onFail?.(new Error("late failure"));
      }).not.toThrow();
      await expect(pending).rejects.toMatchObject({ type: "TIMEOUT" });
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([
      {
        name: "answers",
        script: ((cb) => cb.onSuccess?.(rows(1))) as typeof scripted.script,
      },
      {
        name: "fails",
        script: ((cb) =>
          cb.onFail?.(new Error("boom"))) as typeof scripted.script,
      },
    ])(
      "clears its deadline as soon as the connector $name",
      async ({ script }) => {
        scripted.script = script;

        await executeQuery(SCRIPTED_TYPE, {}, { query: "Q" }).catch(() => {});

        expect(vi.getTimerCount()).toBe(0);
      },
    );

    describe("the connection probe", () => {
      /** Resolves once checkConnection has been called. */
      function probeOnce(answer: Promise<boolean>) {
        return new Promise<void>((called) => {
          scripted.check = () => {
            called();
            return answer;
          };
        });
      }

      // A probe holds a scheduler slot too (#1426), so one that never settles
      // would pin it for the life of the process, one per Test click.
      it("rejects with a non-transient TIMEOUT when checkConnection never settles", async () => {
        const probed = probeOnce(new Promise(() => {}));
        const state = outcome(testConnection(SCRIPTED_TYPE, {}));
        await probed;

        await vi.advanceTimersByTimeAsync(DEFAULT_DEADLINE - 1);
        expect(state.settled).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        expect(state.error).toMatchObject({
          name: "ConnectorError",
          type: "TIMEOUT",
          classification: { type: "TIMEOUT", transient: false },
        });
        expect(vi.getTimerCount()).toBe(0);
      });

      it.each([
        { name: "passes", answer: () => Promise.resolve(true), value: true },
        { name: "fails", answer: () => Promise.resolve(false), value: false },
      ])(
        "answers as the connector did and clears its deadline when it $name",
        async ({ answer, value }) => {
          scripted.check = answer;

          await expect(testConnection(SCRIPTED_TYPE, {})).resolves.toBe(value);
          expect(vi.getTimerCount()).toBe(0);
        },
      );

      it("clears its deadline when the probe throws", async () => {
        scripted.check = () => Promise.reject(new Error("refused"));

        await expect(testConnection(SCRIPTED_TYPE, {})).rejects.toMatchObject({
          name: "ConnectorError",
        });
        expect(vi.getTimerCount()).toBe(0);
      });
    });
  });
});
