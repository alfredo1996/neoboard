import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, DOCKER } from "./compose-config.mjs";

/**
 * #2439 — the log shipping kit. The add-on has no image or build for the app,
 * so it only means something layered on a production file; and the Kubernetes
 * values carry a copy of the lua script, which can drift from the Docker one.
 */
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const resolveWith = (base) =>
  JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "-f",
        join(DOCKER, base),
        "-f",
        join(DOCKER, "docker-compose.logging.yml"),
        "config",
        "--format",
        "json",
      ],
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

describe("the logging add-on (#2439)", () => {
  it.each(["docker-compose.prod.yml", "docker-compose.prod-full.yml"])(
    "sends the app's logs to Fluent Bit on top of %s",
    (base) => {
      const { services } = resolveWith(base);
      // fluentd driver only: json-file's size options must not leak into it.
      expect(services.neoboard.logging.driver).toBe("fluentd");
      expect(Object.keys(services.neoboard.logging.options).sort()).toEqual([
        "fluentd-address",
        "fluentd-async",
        "tag",
      ]);
      expect(Object.keys(services)).toEqual(
        expect.arrayContaining([
          "fluent-bit",
          "opensearch",
          "opensearch-dashboards",
        ]),
      );
    },
    60_000,
  );

  it("pins every image to an exact version", () => {
    const { services } = resolveWith("docker-compose.prod.yml");
    const added = Object.entries(services).filter(([n]) => n !== "neoboard");
    for (const [, svc] of added) expect(svc.image).toMatch(/:\d+\.\d+\.\d+$/);
  }, 60_000);
});

describe("the Kubernetes values (#2439)", () => {
  it("embed the same lua script as the Docker config", () => {
    const lua = read("deploy/fluent-bit/neoboard.lua");
    const indented = lua
      .split("\n")
      .map((l) => (l ? `    ${l}` : l))
      .join("\n");
    expect(read("deploy/kubernetes/fluent-bit-values.yaml")).toContain(
      indented,
    );
  });
});

describe("the Fluent Bit pipeline workflow (#2439)", () => {
  it("re-runs when any file of the kit changes", () => {
    const wf = read(".github/workflows/log-shipping-pipeline.yml");
    for (const p of [
      "deploy/fluent-bit/**",
      "deploy/opensearch/**",
      "docker/docker-compose.logging.yml",
    ]) {
      expect(wf).toContain(`- '${p}'`);
    }
    expect(wf).toContain("workflow_dispatch");
  });
});
