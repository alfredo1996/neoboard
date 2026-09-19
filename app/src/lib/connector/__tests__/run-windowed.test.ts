import { describe, it, expect } from "vitest";
import { runWindowed } from "../run-windowed";

/** A worker whose every call is settled by hand, so the test owns the clock. */
function manualWorker() {
  const started: number[] = [];
  const settle = new Map<number, (ok: boolean) => void>();
  const worker = (item: number) =>
    new Promise<void>((resolve, reject) => {
      started.push(item);
      settle.set(item, (ok) => (ok ? resolve() : reject(new Error("boom"))));
    });
  return { started, settle, worker };
}

/** Let every already-resolved promise run its continuations. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("runWindowed (#1426)", () => {
  it("never has more than the limit in flight, and settles every item", async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];
    await runWindowed([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async (item) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await flush();
      seen.push(item);
      inFlight--;
    });
    expect(peak).toBe(3);
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("is a sliding window: a hanging item holds one slot, not its whole batch", async () => {
    const { started, settle, worker } = manualWorker();
    const run = runWindowed([1, 2, 3, 4, 5, 6], 3, worker);
    await flush();
    expect(started).toEqual([1, 2, 3]);

    // Item 1 hangs. Its two batch-mates finish, and both slots refill at
    // once — strict batches would wait here for item 1.
    settle.get(2)!(true);
    settle.get(3)!(true);
    await flush();
    expect(started).toEqual([1, 2, 3, 4, 5]);

    settle.get(4)!(true);
    settle.get(5)!(true);
    await flush();
    expect(started).toEqual([1, 2, 3, 4, 5, 6]);

    settle.get(6)!(true);
    settle.get(1)!(true);
    await run;
  });

  it("reports each item as it settles, not at the end", async () => {
    const { settle, worker } = manualWorker();
    const reports: Array<[number, number]> = [];
    const run = runWindowed([1, 2, 3], 3, worker, (item, done) =>
      reports.push([item, done]),
    );
    await flush();

    settle.get(3)!(true);
    await flush();
    expect(reports).toEqual([[3, 1]]);

    settle.get(1)!(true);
    await flush();
    settle.get(2)!(true);
    await run;
    expect(reports).toEqual([
      [3, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it("a worker that throws counts as settled and does not stop the run", async () => {
    const { started, settle, worker } = manualWorker();
    const reports: number[] = [];
    const run = runWindowed([1, 2], 1, worker, (item) => reports.push(item));
    await flush();
    settle.get(1)!(false);
    await flush();
    expect(started).toEqual([1, 2]);
    settle.get(2)!(true);
    await expect(run).resolves.toBeUndefined();
    expect(reports).toEqual([1, 2]);
  });

  it("resolves at once for an empty list", async () => {
    await expect(
      runWindowed([], 3, () => Promise.reject(new Error("never called"))),
    ).resolves.toBeUndefined();
  });
});
