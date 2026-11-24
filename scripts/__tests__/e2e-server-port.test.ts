import { EventEmitter } from "node:events";
import * as http from "node:http";
import * as net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  CDP_OFFSET,
  PICK_MIN,
  PICK_SPAN,
  assertServerPortsFree,
  isPortFree,
  resolveServerPort,
  waitForServer,
} from "../../app/e2e/server-port";

const open: net.Server[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.close();
});

function hold(port = 0, host?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(port, host, () => {
      open.push(s);
      resolve((s.address() as net.AddressInfo).port);
    });
  });
}

describe("resolveServerPort", () => {
  it("unset: writes the picked port and its auto flag to env", () => {
    const env: NodeJS.ProcessEnv = {};
    const port = resolveServerPort(
      env,
      () => 0.5,
      () => true,
    );
    expect(env.TEST_SERVER_PORT).toBe(String(port));
    expect(env.TEST_SERVER_PORT_AUTO).toBe("1");
  });

  it("keeps picks, plus the CDP partner, below Linux's ephemeral range", () => {
    expect(PICK_MIN + PICK_SPAN + CDP_OFFSET).toBeLessThanOrEqual(32_768);
    expect(PICK_SPAN).toBe(6_000);
    expect(
      resolveServerPort(
        {},
        () => 0.999999,
        () => true,
      ),
    ).toBe(25_999);
  });

  it("unset: skips a candidate whose CDP partner is busy", () => {
    const busy = new Set([PICK_MIN + CDP_OFFSET]);
    const rolls = [0, 0.5];
    const port = resolveServerPort(
      {},
      () => rolls.shift() ?? 0.5,
      (p) => !busy.has(p),
    );
    expect(port).toBe(23_000);
  });

  it("set: returns that port untouched", () => {
    expect(resolveServerPort({ TEST_SERVER_PORT: "3500" })).toBe(3500);
  });
});

describe("isPortFree", () => {
  it.each([
    ["127.0.0.1", "127.0.0.1"],
    ["::1", "::1"],
    ["::", "::"],
  ])("is false while another process listens on %s", async (_n, host) => {
    const port = await hold(0, host);
    expect(isPortFree(port)).toBe(false);
  });

  it("is true for a port nobody holds", async () => {
    const port = await hold(0, "127.0.0.1");
    open.pop()?.close();
    expect(isPortFree(port)).toBe(true);
  });
});

describe("assertServerPortsFree", () => {
  it("tells an explicit port's owner to unset it, and an auto-picked one to re-run", () => {
    const busy = () => false;
    expect(() => assertServerPortsFree(3500, busy, {})).toThrow(
      /Unset TEST_SERVER_PORT/,
    );
    expect(() =>
      assertServerPortsFree(3500, busy, { TEST_SERVER_PORT_AUTO: "1" }),
    ).toThrow(/re-run to pick another port/);
  });

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
