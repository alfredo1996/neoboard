import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, resolve } from "./compose-config.mjs";

/**
 * #2439 — the log shipping kit. The add-on has no image or build for the app,
 * so it only means something layered on a production file; and the Kubernetes
 * values carry a copy of the lua script, which can drift from the Docker one.
 */
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const resolveWith = (base) => resolve(base, "docker-compose.logging.yml");

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

  it("keeps OpenSearch on its own network, away from the app", () => {
    const { services } = resolveWith("docker-compose.prod-full.yml");
    const nets = (n) => Object.keys(services[n].networks ?? { default: {} });
    for (const n of [
      "fluent-bit",
      "opensearch",
      "opensearch-init",
      "opensearch-dashboards",
    ]) {
      expect(nets(n)).toEqual(["logging"]);
    }
    expect(nets("neoboard")).not.toContain("logging");
  }, 60_000);

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

// The two outputs share one contract: no chunk lost to a retry cap, no
// duplicate from a retried bulk request, a disk buffer with a ceiling.
describe.each([
  ["Docker", "deploy/fluent-bit/fluent-bit.conf"],
  ["Kubernetes", "deploy/kubernetes/fluent-bit-values.yaml"],
])("the %s Fluent Bit config (#2439)", (_, file) => {
  const conf = () => read(file);
  it.each([
    [/^\s*Retry_Limit\s+no_limits\s*$/m, "retries without a cap"],
    [/^\s*Generate_ID\s+On\s*$/m, "stable ids, so a retry cannot duplicate"],
    [/^\s*storage\.total_limit_size\s+\S+/m, "a disk buffer ceiling"],
    [/^\s*storage\.type\s+filesystem\s*$/m, "a filesystem buffer on the input"],
  ])("sets %s", (re) => {
    expect(conf()).toMatch(re);
  });
});

describe("the Kubernetes values verify TLS (#2439)", () => {
  it("check the OpenSearch certificate unless the opt-out is uncommented", () => {
    const v = read("deploy/kubernetes/fluent-bit-values.yaml");
    expect(v).toMatch(/^\s*tls\.verify\s+On\s*$/m);
    expect(v).toMatch(/^\s*tls\.ca_file\s+\S+/m);
    expect(v).not.toMatch(/^\s*tls\.verify\s+Off/m);
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
