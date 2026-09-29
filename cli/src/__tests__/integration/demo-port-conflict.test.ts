/**
 * CLI Integration Test — `neoboard demo` against a busy port (#2057)
 *
 * The real demo flow, no mocks, against a throwaway project root whose config
 * points `ports.neo4j_bolt` at a port this test holds open. The flow must stop
 * in the preflight: exit code 1, the config-key hint in the output, and
 * Compose never run. composeUp writes docker/.env before it calls Compose, so
 * that file never appearing is the proof.
 *
 * Kept out of demo-flow.test.ts on purpose: that file's beforeAll brings the
 * real stack up, and this test is about never reaching Compose. Docker is
 * needed only for doctor's daemon checks; no container is started.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { createServer, type AddressInfo, type Server } from "node:net";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { _setRootForTesting } from "../../lib/config.js";
import { runDemo } from "../../commands/demo.js";

const SKIP = process.env.SKIP_INTEGRATION === "1" || !isDockerAvailable();

function isDockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function listen(): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const portOf = (server: Server) => (server.address() as AddressInfo).port;
const close = (server: Server) =>
  new Promise<void>((resolve) => server.close(() => resolve()));

async function freePort(): Promise<number> {
  const server = await listen();
  const port = portOf(server);
  await close(server);
  return port;
}

describe.skipIf(SKIP)("neoboard demo with a busy port (#2057)", () => {
  let root: string;
  let busy: Server;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "neoboard-2057-"));
    busy = await listen();
    const config = {
      ports: {
        app: await freePort(),
        postgres: await freePort(),
        neo4j_http: await freePort(),
        neo4j_bolt: portOf(busy),
      },
      postgres: { user: "neoboard", password: "neoboard", database: "neoboard" },
      neo4j: { user: "neo4j", password: "neoboard123" },
      seed: {
        script: "scripts/seed-demo.mjs",
        neo4j_cypher: "docker/neo4j/init.cypher",
      },
    };
    writeFileSync(join(root, "neoboard.config.json"), JSON.stringify(config));
    _setRootForTesting(root);
  });

  afterAll(async () => {
    _setRootForTesting(null);
    await close(busy);
    rmSync(root, { recursive: true, force: true });
    process.exitCode = 0;
  });

  it("stops before Compose with exit 1, naming the config key to change", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      // Resolves: no docker-modem "port is already allocated" throw.
      await runDemo();
      const out = log.mock.calls
        .map((c) => stripVTControlCharacters(String(c[0])))
        .join("\n");

      expect(process.exitCode).toBe(1);
      expect(out).toMatch(
        new RegExp(
          String.raw`Port ${portOf(busy)} \(Neo4j Bolt\) is in use\. Run ` +
            String.raw`\`neoboard config set ports\.neo4j_bolt \d+\`, or stop the other process\.`,
        ),
      );
      expect(existsSync(join(root, "docker", ".env"))).toBe(false);
      expect(out).not.toContain("Demo environment ready!");
    } finally {
      log.mockRestore();
    }
  });
});
