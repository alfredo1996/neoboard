import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

// Which bind error each probe address answers with. A real socket cannot be
// made to fail on loopback with EADDRNOTAVAIL, so this file fakes `node:net`;
// ports.test.ts keeps the real-socket cases.
const failures: Record<string, string | undefined> = {};

vi.mock("node:net", () => ({
  createServer: () => {
    const server = new EventEmitter() as EventEmitter & {
      listen: (port: number, host: string) => void;
      close: (cb: () => void) => void;
    };
    server.listen = (_port, host) =>
      queueMicrotask(() => {
        const code = failures[host];
        if (code) server.emit("error", Object.assign(new Error(code), { code }));
        else server.emit("listening");
      });
    server.close = (cb) => cb();
    return server;
  },
}));

const { isPortAvailable } = await import("../../lib/ports.js");

describe("isPortAvailable — bind errors", () => {
  beforeEach(() => {
    for (const host of Object.keys(failures)) delete failures[host];
  });

  it.each(["EAFNOSUPPORT", "EADDRNOTAVAIL"])(
    "counts the port free when only the IPv6 probe fails with %s (no IPv6 here)",
    async (code) => {
      failures["::"] = code;
      expect(await isPortAvailable(3000)).toBe(true);
    },
  );

  it.each(["127.0.0.1", "0.0.0.0"])(
    "counts the port busy when the %s probe fails with EADDRNOTAVAIL",
    async (host) => {
      failures[host] = "EADDRNOTAVAIL";
      expect(await isPortAvailable(3000)).toBe(false);
    },
  );

  it("counts the port busy when a probe fails with EADDRINUSE", async () => {
    failures["0.0.0.0"] = "EADDRINUSE";
    expect(await isPortAvailable(3000)).toBe(false);
  });
});
