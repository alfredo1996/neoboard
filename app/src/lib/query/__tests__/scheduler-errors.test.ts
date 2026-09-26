import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  QueueRejectedError,
  QueueTimeoutError,
  isQueueRejected,
  isQueueTimeout,
} from "../scheduler";

/**
 * #2008: a production build loads scheduler.ts once per bundle, and the
 * scheduler on globalThis throws the instrumentation bundle's classes. An
 * `instanceof` in a route compares against another copy and is false, so a
 * full queue answered 500. The scheduler's errors are recognised by name.
 */
describe("the scheduler's errors are recognised by name (#2008)", () => {
  class ForeignRejected extends Error {
    readonly reason = "shed" as const;
    constructor() {
      super("shed");
      this.name = "QueueRejectedError";
    }
  }
  class ForeignTimeout extends Error {
    constructor() {
      super("timeout");
      this.name = "QueueTimeoutError";
    }
  }

  it("accepts this module's classes and another copy of them", () => {
    expect(isQueueRejected(new QueueRejectedError("queue_full", "x"))).toBe(
      true,
    );
    expect(isQueueRejected(new ForeignRejected())).toBe(true);
    expect(isQueueTimeout(new QueueTimeoutError())).toBe(true);
    expect(isQueueTimeout(new ForeignTimeout())).toBe(true);
  });

  it("rejects anything else, whatever its message", () => {
    for (const other of [
      new Error("query scheduler queue full"),
      new ForeignTimeout(),
      { name: "QueueRejectedError", reason: "queue_full" },
      "QueueRejectedError",
      null,
    ]) {
      expect(isQueueRejected(other)).toBe(false);
    }
    expect(isQueueTimeout(new ForeignRejected())).toBe(false);
  });

  it("no server code tests them with instanceof", () => {
    const src = join(__dirname, "..", "..", "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "__tests__" && name !== "node_modules") walk(path);
        } else if (/\.tsx?$/.test(name)) {
          const text = readFileSync(path, "utf8");
          if (/instanceof\s+Queue(Rejected|Timeout)Error\b/.test(text)) {
            offenders.push(relative(src, path));
          }
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
