import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMPOSE_ASSETS, stageStandaloneCompose } from "../../lib/assets.js";

// Real temp directories, not a mocked fs: what matters is what lands where.
let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "nb-assets-"));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("stageStandaloneCompose (#1314)", () => {
  it("writes every compose asset, nested ones included, under the docker dir", () => {
    const dir = join(tmp, "docker");
    stageStandaloneCompose(dir, (name) => `content of ${name}`);
    for (const name of COMPOSE_ASSETS) {
      expect(readFileSync(join(dir, name), "utf8")).toBe(`content of ${name}`);
    }
  });

  it("replaces a stale copy, so an upgraded binary brings its own compose", () => {
    const dir = join(tmp, "docker");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "docker-compose.full.yml"), "old");
    stageStandaloneCompose(dir, () => "new");
    expect(readFileSync(join(dir, "docker-compose.full.yml"), "utf8")).toBe(
      "new",
    );
  });

  it("never touches docker/.env, where the secrets and the pinned image live", () => {
    const dir = join(tmp, "docker");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".env"), "ENCRYPTION_KEY=keep");
    stageStandaloneCompose(dir, () => "x");
    expect(readFileSync(join(dir, ".env"), "utf8")).toBe("ENCRYPTION_KEY=keep");
  });
});

describe("compose asset list", () => {
  it("is a subset of what the npm package and the binary both ship", () => {
    const shipped: string[] = JSON.parse(
      readFileSync(
        new URL("../../../scripts/compose-assets.json", import.meta.url),
        "utf8",
      ),
    );
    for (const name of COMPOSE_ASSETS) expect(shipped).toContain(name);
  });

  it("names files that exist in the repo's docker/ directory", () => {
    for (const name of COMPOSE_ASSETS) {
      const p = new URL(`../../../../docker/${name}`, import.meta.url);
      expect(() => readFileSync(p)).not.toThrow();
    }
  });
});
