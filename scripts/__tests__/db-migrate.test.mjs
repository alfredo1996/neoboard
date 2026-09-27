import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { databaseUrl } from "../db-migrate.mjs";

const ROOT = new URL("../..", import.meta.url).pathname;
const scripts = (pkg) =>
  JSON.parse(readFileSync(join(ROOT, pkg), "utf8")).scripts;

// drizzle-kit exited 1 with nothing on stderr when a migration failed, and it
// read only .env, never the app/.env.local that `neoboard init --mode local`
// writes, so the documented local setup could not migrate at all (#2041).
describe("npm run db:migrate (#2041)", () => {
  it("runs the server's migrator, as neoboard db migrate does", () => {
    expect(scripts("app/package.json")["db:migrate"]).toBe(
      "node ../scripts/db-migrate.mjs",
    );
    expect(scripts("package.json")["db:migrate"]).toBe(
      "npm -w app run db:migrate",
    );
  });

  it("leaves generating migrations to drizzle-kit", () => {
    expect(scripts("app/package.json")["db:generate"]).toMatch(
      /^drizzle-kit generate/,
    );
  });
});

describe("databaseUrl (#2041)", () => {
  function envLocal(text) {
    const file = join(mkdtempSync(join(tmpdir(), "db-migrate-")), ".env.local");
    writeFileSync(file, text);
    return file;
  }

  it("takes DATABASE_URL from the environment first", () => {
    const file = envLocal("DATABASE_URL=postgres://file\n");
    expect(databaseUrl({ DATABASE_URL: "postgres://env" }, file)).toBe(
      "postgres://env",
    );
  });

  it("falls back to app/.env.local, where neoboard init --mode local writes it", () => {
    const file = envLocal(
      "NEXTAUTH_URL=http://x\nDATABASE_URL=postgres://file\n",
    );
    expect(databaseUrl({}, file)).toBe("postgres://file");
  });

  it("reads a quoted value as the CLI does", () => {
    expect(databaseUrl({}, envLocal('DATABASE_URL="postgres://dq"\n'))).toBe(
      "postgres://dq",
    );
    expect(databaseUrl({}, envLocal("DATABASE_URL='postgres://sq'\n"))).toBe(
      "postgres://sq",
    );
  });

  it("is undefined with neither", () => {
    expect(databaseUrl({}, join(tmpdir(), "no-such-dir", ".env.local"))).toBe(
      undefined,
    );
    expect(databaseUrl({}, envLocal("OTHER=1\n"))).toBe(undefined);
  });
});

// The script runs only as a command, so a test can import databaseUrl. The
// check must survive a checkout reached through a symlink (macOS /tmp is
// /private/tmp): the ESM loader resolves the module's real path, argv does
// not, and a mismatch would skip the migration and exit 0 in silence.
describe("scripts/db-migrate.mjs as a command (#2041)", () => {
  it("runs when started through a symlink to the repo", () => {
    const link = join(mkdtempSync(join(tmpdir(), "db-migrate-link-")), "repo");
    symlinkSync(ROOT, link);
    const r = spawnSync(
      process.execPath,
      [join(link, "scripts/db-migrate.mjs")],
      {
        env: { PATH: process.env.PATH, DATABASE_URL: "" },
        cwd: tmpdir(),
        encoding: "utf8",
      },
    );
    // No URL anywhere reachable from the link's app/.env.local? It says so
    // and exits 1 — proof main() ran rather than being skipped.
    if (r.status === 0) throw new Error("the script did not run: " + r.stderr);
    expect(r.stderr).toMatch(/DATABASE_URL|ECONNREFUSED|connect/);
  });
});
