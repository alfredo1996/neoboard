import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// After a Docker restart only services with a restart policy come back. A
// service that restarts while its dependency does not crash-loops (#2182).
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const DOCKER = join(ROOT, "docker");
const RESTARTS = new Set(["always", "unless-stopped"]);

// The expose-host overlay has no image or build, so it cannot resolve alone.
const standalone = readdirSync(DOCKER).filter(
  (f) => f.endsWith(".yml") && f !== "docker-compose.expose-host.yml",
);

// Compose normalises both depends_on syntaxes. Placeholders stand in for the
// `:?` vars; docker/.env is gitignored and absent in CI.
const resolve = (file) =>
  JSON.parse(
    execFileSync(
      "docker",
      ["compose", "-f", join(DOCKER, file), "config", "--format", "json"],
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          ENCRYPTION_KEY: "0".repeat(64),
          NEXTAUTH_SECRET: "test-secret",
          API_KEY_HMAC_SECRET: "0".repeat(64),
          DATABASE_URL: "postgres://x:x@localhost/x",
          POSTGRES_PASSWORD: "test-password",
        },
      },
    ),
  );

describe("a restarting service never outlives its dependencies (#2182)", () => {
  it.each(standalone)(
    "%s",
    (file) => {
      const { services } = resolve(file);
      const orphaned = Object.entries(services).flatMap(([name, svc]) =>
        RESTARTS.has(svc.restart)
          ? Object.keys(svc.depends_on ?? {})
              .filter((dep) => !RESTARTS.has(services[dep]?.restart))
              .map((dep) => `${name} -> ${dep}`)
          : [],
      );
      expect(orphaned).toEqual([]);
    },
    60_000,
  );
});
