import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The image listens on 0.0.0.0 (IPv4 only). BusyBox wget resolves `localhost`
// to ::1 when the container's loopback has IPv6 on (Docker Engine 29) and does
// not fall back, so a probe of `localhost` reports unhealthy while the app
// serves (#2432). In-container probes must name 127.0.0.1.
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const DOCKER = join(ROOT, "docker");
const PROBE = "127.0.0.1:3000/api/health";

const standalone = readdirSync(DOCKER).filter(
  (f) => f.endsWith(".yml") && f !== "docker-compose.expose-host.yml",
);

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

describe("in-container health checks probe 127.0.0.1, not localhost (#2432)", () => {
  it("the Dockerfile HEALTHCHECK probes the app on 127.0.0.1", () => {
    const text = readFileSync(join(ROOT, "Dockerfile"), "utf8");
    const check = text.match(/^HEALTHCHECK[\s\S]*?(?=^\S|\n\n)/m)?.[0] ?? "";
    expect(check).toContain(PROBE);
    expect(check).not.toContain("localhost");
  });

  it.each(standalone)(
    "%s",
    (file) => {
      const { services } = resolve(file);
      const probes = Object.values(services)
        .map((s) => s.healthcheck?.test)
        .filter(Boolean)
        .map((t) => t.join(" "));
      expect(probes.filter((p) => p.includes("localhost"))).toEqual([]);
    },
    60_000,
  );

  it("the full stack's app service has a health check on 127.0.0.1", () => {
    const { services } = resolve("docker-compose.full.yml");
    expect(services.neoboard.healthcheck.test.join(" ")).toContain(PROBE);
  });
});
