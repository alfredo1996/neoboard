import { EventEmitter } from "node:events";
import * as http from "node:http";
import * as net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  CDP_OFFSET,
  assertServerPortsFree,
  isPortFree,
  resolveServerPort,
  waitForServer,
} from "../../app/e2e/server-port";

const open: net.Server[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.close();
});

function hold(port = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(port, () => {
      open.push(s);
      resolve((s.address() as net.AddressInfo).port);
    });
  });
}

describe("resolveServerPort", () => {
  it("unset: picks a free pair, not the held default, and writes it to env", async () => {
    await hold(3100).catch(() => undefined);
    const env: NodeJS.ProcessEnv = {};
    const port = resolveServerPort(env);
    expect(port).not.toBe(3100);
    expect(env.TEST_SERVER_PORT).toBe(String(port));
    expect(isPortFree(port)).toBe(true);
    expect(isPortFree(port + CDP_OFFSET)).toBe(true);
  });

  it("unset: skips a candidate whose CDP partner is busy", () => {
    const busy = new Set([20_000 + CDP_OFFSET]);
    const rolls = [0, 0.5];
    const port = resolveServerPort(
      {},
      () => rolls.shift() ?? 0.5,
      (p) => !busy.has(p),
    );
    expect(port).toBe(26_000);
  });

  it("set: returns that port untouched", () => {
    expect(resolveServerPort({ TEST_SERVER_PORT: "3500" })).toBe(3500);
  });
});

describe("assertServerPortsFree", () => {
  it("throws naming the busy server port and how to find its owner", async () => {
    const port = await hold();
    expect(() => assertServerPortsFree(port)).toThrow(
      new RegExp(`Port ${port} .*lsof -nP -iTCP:${port}`),
    );
  });

  it("throws naming the busy CDP port", async () => {
    const cdp = await hold();
    expect(() => assertServerPortsFree(cdp - CDP_OFFSET)).toThrow(
      `Port ${cdp} `,
    );
  });

  it("passes when both are free", () => {
    expect(() => assertServerPortsFree(resolveServerPort({}))).not.toThrow();
  });
});

describe("waitForServer", () => {
  it("rejects with the exit code when the child dies, though another listener answers", async () => {
    const other = http.createServer((_, res) => res.end("other run"));
    await new Promise<void>((r) => other.listen(0, r));
    const port = (other.address() as net.AddressInfo).port;
    const child = new EventEmitter();
    const wait = waitForServer(
      port,
      child,
      () => "EADDRINUSE",
      5_000,
      10_000,
      200,
    );
    setTimeout(() => child.emit("exit", 1, null), 20);
    await expect(wait).rejects.toThrow(/code 1[\s\S]*EADDRINUSE/);
    other.close();
  });

  it("resolves when the live child's server answers", async () => {
    const srv = http.createServer((_, res) => res.end("ok"));
    await new Promise<void>((r) => srv.listen(0, r));
    const port = (srv.address() as net.AddressInfo).port;
    await expect(
      waitForServer(port, new EventEmitter(), () => "", 5_000, 500, 0),
    ).resolves.toBeUndefined();
    srv.close();
  });
});
