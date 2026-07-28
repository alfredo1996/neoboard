import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

/**
 * The published package is what strangers run. `.github/workflows/release.yml`
 * publishes @neoboard/cli on every `v*` tag, so the first tag makes
 * `npx @neoboard/cli setup` real — and today it throws before doing anything,
 * because root detection walks up from the CLI's own install location looking
 * for the monorepo, and under npx that is an npm cache directory (#1315).
 *
 * These tests run against a REAL temp directory tree rather than a mocked fs:
 * the bug is entirely about what exists on disk where, which a mocked
 * existsSync would happily lie about.
 */

let tmp: string;
let originalNeoboardDir: string | undefined;

async function loadConfig() {
  const mod = await import("../../lib/config.js");
  mod._setRootForTesting(null);
  return mod;
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "nb-standalone-"));
  originalNeoboardDir = process.env.NEOBOARD_DIR;
});

afterEach(async () => {
  const mod = await import("../../lib/config.js");
  mod._setRootForTesting(null);
  // Restore rather than delete — a developer or CI process may have set it,
  // and clobbering it leaks this suite's state outward.
  if (originalNeoboardDir === undefined) delete process.env.NEOBOARD_DIR;
  else process.env.NEOBOARD_DIR = originalNeoboardDir;
  rmSync(tmp, { recursive: true, force: true });
});

describe("findProjectRoot (#1315)", () => {
  it("finds the monorepo root when one is above the start dir", () => {
    // The contributor path, and the regression risk: every existing command
    // depends on this working exactly as it does today.
    writeFileSync(
      join(tmp, "package.json"),
      JSON.stringify({ name: "neoboard" }),
    );
    const nested = join(tmp, "cli", "dist", "lib");
    mkdirSync(nested, { recursive: true });

    return loadConfig().then(({ findProjectRoot }) => {
      expect(findProjectRoot(nested)).toBe(tmp);
    });
  });

  it("returns null instead of throwing when there is no monorepo above", async () => {
    // Throwing deep in a path helper is why this surfaced as an unrelated
    // -looking crash: `neoboard setup` died in root detection, reporting
    // nothing about npx or standalone mode.
    const nested = join(tmp, "npm", "_npx", "abc123", "node_modules");
    mkdirSync(nested, { recursive: true });
    const { findProjectRoot } = await loadConfig();
    expect(findProjectRoot(nested)).toBeNull();
  });

  it("ignores a package.json that is not the monorepo root", async () => {
    writeFileSync(
      join(tmp, "package.json"),
      JSON.stringify({ name: "some-other-project" }),
    );
    const nested = join(tmp, "node_modules", "@neoboard", "cli");
    mkdirSync(nested, { recursive: true });
    const { findProjectRoot } = await loadConfig();
    expect(findProjectRoot(nested)).toBeNull();
  });

  it("survives an unparseable package.json on the way up", async () => {
    writeFileSync(join(tmp, "package.json"), "{ not json");
    const nested = join(tmp, "a");
    mkdirSync(nested, { recursive: true });
    const { findProjectRoot } = await loadConfig();
    expect(findProjectRoot(nested)).toBeNull();
  });
});

describe("resolveRoot — standalone working directory (#1315)", () => {
  it("uses NEOBOARD_DIR when set, creating it", async () => {
    const dir = join(tmp, "custom-workdir");
    process.env.NEOBOARD_DIR = dir;
    const { resolveRoot, isStandalone } = await loadConfig();
    expect(resolveRoot(join(tmp, "nowhere"))).toBe(dir);
    // Asserting the returned path alone would still pass with mkdirSync
    // removed — and a standalone install has nowhere to write config, .env or
    // generated secrets if the directory is not actually created.
    expect(existsSync(dir)).toBe(true);
    expect(isStandalone(join(tmp, "nowhere"))).toBe(true);
  });

  it("prefers the monorepo root over NEOBOARD_DIR when inside a checkout", async () => {
    // A contributor with NEOBOARD_DIR exported for another install must not
    // have their checkout silently redirected.
    writeFileSync(
      join(tmp, "package.json"),
      JSON.stringify({ name: "neoboard" }),
    );
    const nested = join(tmp, "cli", "dist");
    mkdirSync(nested, { recursive: true });
    process.env.NEOBOARD_DIR = join(tmp, "elsewhere");

    const { resolveRoot, isStandalone } = await loadConfig();
    expect(resolveRoot(nested)).toBe(tmp);
    expect(isStandalone(nested)).toBe(false);
  });

  it("falls back to ./neoboard in the current directory", async () => {
    const { resolveRoot } = await loadConfig();
    const resolved = resolveRoot(join(tmp, "npm-cache"));
    expect(resolved).toBe(join(process.cwd(), "neoboard"));
    expect(existsSync(resolved)).toBe(true);
    rmSync(resolved, { recursive: true, force: true });
  });
});

describe("invocation directory wins over install location (#1315)", () => {
  const withCwd = async (dir: string, fn: () => Promise<void> | void) => {
    const prev = process.cwd();
    process.chdir(dir);
    try {
      await fn();
    } finally {
      process.chdir(prev);
    }
  };

  it("uses the checkout you are standing in, not ./neoboard", async () => {
    // A globally installed or npx'd CLI run from inside a checkout must use
    // that checkout. Searching only from the CLI's install location would call
    // it standalone, refuse `dev`, and create ./neoboard inside the user's own
    // source tree with the repo right there.
    writeFileSync(
      join(tmp, "package.json"),
      JSON.stringify({ name: "neoboard" }),
    );
    const { resolveRoot, isStandalone, assertCheckout } = await loadConfig();

    await withCwd(tmp, () => {
      expect(resolveRoot()).toBe(process.cwd());
      expect(isStandalone()).toBe(false);
      expect(() => assertCheckout("dev")).not.toThrow();
      expect(existsSync(join(tmp, "neoboard"))).toBe(false);
    });
  });

  it("falls back to the install location when cwd has no checkout", async () => {
    // The monorepo's own `node cli/dist/index.js` run from an unrelated
    // directory still has to find its root.
    const { isStandalone } = await loadConfig();
    await withCwd(tmp, () => {
      // This suite's own module lives inside the monorepo, so the fallback
      // finds it even though cwd is a bare temp dir.
      expect(isStandalone()).toBe(false);
    });
  });
});

describe("assertCheckout (#1315)", () => {
  it("passes silently inside a checkout", async () => {
    // The CLI's own module lives inside this monorepo when the tests run, so
    // isStandalone() is genuinely false here — no mocking needed.
    const { assertCheckout } = await loadConfig();
    expect(() => assertCheckout("dev")).not.toThrow();
  });

  it("names the command and points at the clone, not a missing file", async () => {
    // Without this, `dev` and `db seed` fail on a missing script deep inside
    // the command, which reads as a bug rather than "not for this install".
    const { assertCheckout } = await loadConfig();
    const outside = join(tmp, "npx-cache");
    mkdirSync(outside, { recursive: true });

    expect(() => assertCheckout("db seed", outside)).toThrow(/db seed/);
    expect(() => assertCheckout("db seed", outside)).toThrow(/git clone/);
    // Says what DOES work, so the reader is not left guessing.
    expect(() => assertCheckout("db seed", outside)).toThrow(
      /setup, start, stop/,
    );
  });
});

describe("packaged files (#1315)", () => {
  // Asserting on `package.json.files` is NOT enough, and believing it was is
  // how this would have shipped broken twice. npm resolves `files` relative to
  // the PACKAGE root; `docker/` lives at the REPO root, one level up. Listing
  // "docker" there does nothing, silently — npm pack succeeds and ships no
  // compose file, while a manifest test passes.
  //
  // So this runs the real `npm pack --dry-run` and reads what would actually
  // be published.
  const packedFiles = (): string[] => {
    // fileURLToPath, not .pathname: the latter keeps the leading slash and
    // percent-encodes spaces, so a checkout under "Program Files" would pass a
    // broken cwd. This repo has already been bitten by a Windows path bug
    // (#991).
    const cliDir = fileURLToPath(new URL("../../..", import.meta.url));
    const out = execFileSync("npm", ["pack", "--dry-run", "--json"], {
      cwd: cliDir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return JSON.parse(out)[0].files.map((f: { path: string }) => f.path);
  };

  it("ships a compose file a standalone install can start from", () => {
    const files = packedFiles();
    // prod-full pulls ghcr.io/... rather than building from source, which a
    // standalone user does not have.
    expect(files).toContain("docker/docker-compose.prod-full.yml");
  }, 60_000);

  it("ships the CLI entrypoint", () => {
    expect(packedFiles()).toContain("dist/index.js");
  }, 60_000);

  it("does NOT ship scripts/ — those commands decline instead", () => {
    // scripts/ is 568K and only `db seed` / `demo` need it. Shipping a
    // checkout's worth of tooling to make one command work is the wrong
    // trade; assertCheckout tells those commands to say so instead.
    expect(packedFiles().some((f) => f.startsWith("scripts/"))).toBe(false);
  }, 60_000);
});
