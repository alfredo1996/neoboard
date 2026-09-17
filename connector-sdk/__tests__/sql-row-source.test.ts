import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { iterateRows } from "../src/sql";
import {
  collectUpToLimit,
  drainRetainingUpTo,
} from "../src/generalized/stream-rows";

/** Object-mode Readable yielding 1..total on demand; `produced()` counts rows generated so far. */
function countingReadable(total: number) {
  let produced = 0;
  const stream = new Readable({
    objectMode: true,
    highWaterMark: 4,
    read() {
      if (produced === total) {
        this.push(null);
        return;
      }
      produced += 1;
      this.push(produced);
    },
  });
  return { stream, produced: () => produced };
}

/** Emits `rows` (and `end`, if given) on a later tick, the way a driver delivers them. */
function emitLater(emitter: EventEmitter, rows: unknown[], end?: string) {
  setImmediate(() => {
    for (const row of rows) emitter.emit("row", row);
    if (end) emitter.emit(end);
  });
}

describe("iterateRows over a Node Readable", () => {
  it("yields every row", async () => {
    await expect(
      collectUpToLimit(iterateRows(Readable.from([1, 2, 3])), 10),
    ).resolves.toEqual({ rows: [1, 2, 3], truncated: false });
  });

  it("back-pressure: stops generating soon after the limit, destroys the stream and releases the source", async () => {
    const { stream, produced } = countingReadable(100_000);
    const release = jest.fn();

    const result = await collectUpToLimit(
      iterateRows<number>(stream, { release }),
      5,
    );

    expect(result).toEqual({ rows: [1, 2, 3, 4, 5], truncated: true });
    // limit + 1 pulled, plus at most what the stream buffers ahead (its
    // highWaterMark) — never the whole 100k source.
    expect(produced()).toBeLessThanOrEqual(5 + 1 + 4 + 1);
    expect(stream.destroyed).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rejects with the stream's error", async () => {
    const stream = new Readable({
      objectMode: true,
      read() {
        this.destroy(new Error("stream broke"));
      },
    });

    await expect(collectUpToLimit(iterateRows(stream), 10)).rejects.toThrow(
      "stream broke",
    );
  });
});

describe("iterateRows over an EventEmitter", () => {
  it("yields rows until an end event", async () => {
    const emitter = new EventEmitter();
    const rows = iterateRows(emitter);
    emitLater(emitter, [1, 2], "done");

    await expect(collectUpToLimit(rows, 10)).resolves.toEqual({
      rows: [1, 2],
      truncated: false,
    });
  });

  it("listens from the call, so rows emitted before iteration starts are kept", async () => {
    const emitter = new EventEmitter();
    const rows = iterateRows(emitter);
    emitter.emit("row", 1);
    emitter.emit("row", 2);
    emitter.emit("end");

    await expect(collectUpToLimit(rows, 10)).resolves.toEqual({
      rows: [1, 2],
      truncated: false,
    });
  });

  it("honours custom row and end event names", async () => {
    const emitter = new EventEmitter();
    const rows = iterateRows(emitter, {
      rowEvent: "data",
      endEvents: ["finish"],
    });
    setImmediate(() => {
      emitter.emit("data", "a");
      emitter.emit("finish");
    });

    await expect(collectUpToLimit(rows, 10)).resolves.toEqual({
      rows: ["a"],
      truncated: false,
    });
  });

  it("rejects with an error event and releases the source", async () => {
    const emitter = new EventEmitter();
    const release = jest.fn();
    const rows = iterateRows(emitter, { release });
    setImmediate(() => {
      emitter.emit("row", 1);
      emitter.emit("error", new Error("connection reset"));
    });

    await expect(collectUpToLimit(rows, 10)).rejects.toThrow(
      "connection reset",
    );
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("on early return releases the source and stops listening", async () => {
    const emitter = new EventEmitter();
    const release = jest.fn();
    const rows = iterateRows(emitter, { release });
    emitLater(emitter, [1, 2, 3, 4, 5]); // no end event: only return() stops it

    await expect(collectUpToLimit(rows, 2)).resolves.toEqual({
      rows: [1, 2],
      truncated: true,
    });
    expect(release).toHaveBeenCalledTimes(1);
    expect(emitter.listenerCount("row")).toBe(0);
    expect(emitter.listenerCount("error")).toBe(0);
  });

  it("does not release a source that ended on its own", async () => {
    const emitter = new EventEmitter();
    const release = jest.fn();
    const rows = iterateRows(emitter, { release });
    emitLater(emitter, [1], "done");

    await collectUpToLimit(rows, 10);

    expect(release).not.toHaveBeenCalled();
  });

  it("lets drainRetainingUpTo pull every row, as a write needs", async () => {
    const emitter = new EventEmitter();
    const release = jest.fn();
    const rows = iterateRows(emitter, { release });
    emitLater(emitter, [1, 2, 3, 4, 5], "done");

    await expect(drainRetainingUpTo(rows, 2)).resolves.toEqual({
      rows: [1, 2],
      truncated: true,
    });
    expect(release).not.toHaveBeenCalled();
  });

  it("back-pressure: pauses a pausable emitter past highWaterMark and resumes it as rows drain", async () => {
    const emitter = Object.assign(new EventEmitter(), {
      pause: jest.fn(),
      resume: jest.fn(),
    });
    const rows = iterateRows(emitter, { highWaterMark: 2 });
    for (const n of [1, 2, 3, 4]) emitter.emit("row", n);

    expect(emitter.pause).toHaveBeenCalled();
    expect(emitter.resume).not.toHaveBeenCalled();

    // End later, so the buffer drains while the source is still open — a
    // closed emitter is never resumed.
    setImmediate(() => emitter.emit("done"));
    await expect(collectUpToLimit(rows, 10)).resolves.toEqual({
      rows: [1, 2, 3, 4],
      truncated: false,
    });
    expect(emitter.resume).toHaveBeenCalled();
  });
});
