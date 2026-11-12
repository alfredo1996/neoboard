import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * #2441 — what the Helm chart must render. Needs `helm` on the PATH; GitHub's
 * ubuntu runners have it. Locally the suite skips when helm is missing, but on
 * CI a missing helm fails, so the chart can never go unchecked there.
 */
const CHART = new URL("../../deploy/helm/neoboard", import.meta.url).pathname;
const HAS_HELM = spawnSync("helm", ["version", "--short"]).status === 0;
// --dry-run=client (offline NOTES rendering) arrived in helm 3.13.
const NOTES_OK =
  HAS_HELM &&
  !/invalid argument "client"/.test(
    spawnSync("helm", ["install", "x", ".", "--dry-run=client"], { encoding: "utf8" }).stderr,
  );
if (!HAS_HELM && process.env.CI) throw new Error("helm is required on CI");

const SECRET_VALUES = {
  "secrets.DATABASE_URL": "postgresql://u:SENTINEL-db@h:5432/d",
  "secrets.ENCRYPTION_KEY": "SENTINEL-enc",
  "secrets.NEXTAUTH_SECRET": "SENTINEL-auth",
  "secrets.API_KEY_HMAC_SECRET": "SENTINEL-hmac",
};
const SECRET_KEYS = [
  "DATABASE_URL",
  "ENCRYPTION_KEY",
  "NEXTAUTH_SECRET",
  "API_KEY_HMAC_SECRET",
];

function chartField(name) {
  return new RegExp(`^${name}: "?([^"\\n]+)"?$`, "m").exec(
    readFileSync(`${CHART}/Chart.yaml`, "utf8"),
  )[1];
}

function sets(values) {
  return Object.entries(values).flatMap(([k, v]) => ["--set", `${k}=${v}`]);
}

/** Rendered documents keyed by kind (a kind can repeat: values are arrays). */
function render(extra = {}) {
  const r = spawnSync(
    "helm",
    ["template", "r", CHART, ...sets({ ...SECRET_VALUES, ...extra })],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr);
  const byKind = {};
  for (const doc of r.stdout.split(/^---$/m)) {
    const kind = /^kind: (\w+)$/m.exec(doc)?.[1];
    if (kind) (byKind[kind] ??= []).push(doc);
  }
  return byKind;
}

function renderNotes(extra = {}) {
  const r = spawnSync(
    "helm",
    ["install", "r", CHART, "--dry-run=client", ...sets({ ...SECRET_VALUES, ...extra })],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.slice(r.stdout.indexOf("NOTES:"));
}

describe.skipIf(!HAS_HELM)("helm chart (#2441)", () => {
  it("keeps every secret out of the ConfigMap and in the Secret", () => {
    const k = render();
    const cm = k.ConfigMap[0];
    for (const key of SECRET_KEYS) expect(cm).not.toContain(key);
    expect(cm).not.toContain("SENTINEL");
    expect(k.Secret).toHaveLength(1);
    for (const key of SECRET_KEYS) expect(k.Secret[0]).toContain(key);
  });

  it("runs non-root, one replica, image = appVersion, boot migrations on", () => {
    const k = render();
    const dep = k.Deployment[0];
    expect(dep).toContain("runAsNonRoot: true");
    expect(dep).toMatch(/^ {2}replicas: 1$/m);
    expect(dep).toContain(`neoboard:${chartField("appVersion")}"`);
    expect(k.ConfigMap[0]).toContain('MIGRATE_ON_START: "1"');
  });

  it("keeps appVersion equal to the root package.json version", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    );
    expect(chartField("appVersion")).toBe(pkg.version);
  });

  it("probes: startup and readiness on /api/health with Host localhost, liveness a TCP check (#2441)", () => {
    const dep = render().Deployment[0];
    const probe = (name) =>
      new RegExp(`${name}:\\n([\\s\\S]*?)(?=\\n {10}\\w|\\n {8}\\w|$)`).exec(dep)[1];
    for (const name of ["startupProbe", "readinessProbe"]) {
      expect(probe(name)).toContain("path: /api/health");
      expect(probe(name)).toMatch(/name: Host\n\s+value: localhost/);
    }
    expect(probe("livenessProbe")).toMatch(/tcpSocket:\n\s+port: http/);
    expect(probe("livenessProbe")).not.toContain("/api/health");
    // boot migrations may take minutes: at least 10 minutes of startup budget
    const t = probe("startupProbe");
    const budget =
      Number(/failureThreshold: (\d+)/.exec(t)[1]) * Number(/periodSeconds: (\d+)/.exec(t)[1]);
    expect(budget).toBeGreaterThanOrEqual(600);
  });

  it("meets Pod Security Standards restricted", () => {
    const dep = render().Deployment[0];
    expect(dep).toMatch(/seccompProfile:\n\s+type: RuntimeDefault/);
    expect(dep).toContain("allowPrivilegeEscalation: false");
    expect(dep).toMatch(/drop:\n\s+- ALL/);
    expect(dep).toContain("runAsNonRoot: true");
  });

  it("rolls the pods when the chart-made Secret changes, not for existingSecret", () => {
    const sum = (extra) => /checksum\/secret: (\w+)/.exec(render(extra).Deployment[0])?.[1];
    expect(sum()).toBeTruthy();
    expect(sum({ "secrets.ENCRYPTION_KEY": "SENTINEL-other" })).not.toBe(sum());
    expect(sum({ existingSecret: "mine" })).toBeUndefined();
  });

  it("refuses a ServiceMonitor while metrics are off", () => {
    expect(() =>
      render({ "metrics.serviceMonitor.enabled": true, "metrics.tokenSecret.name": "m" }),
    ).toThrow(/metrics\.enabled/);
  });

  it("renders no Ingress or ServiceMonitor by default", () => {
    const k = render();
    expect(k.Ingress).toBeUndefined();
    expect(k.ServiceMonitor).toBeUndefined();
    expect(k.Deployment[0]).not.toContain("METRICS_TOKEN");
  });

  it("renders the Ingress with host, class and TLS when enabled", () => {
    const [ing] = render({
      "ingress.enabled": true,
      "ingress.className": "nginx",
      "ingress.host": "nb.example.test",
      "ingress.tls.enabled": true,
    }).Ingress;
    expect(ing).toContain("ingressClassName: nginx");
    expect(ing).toContain("nb.example.test");
    expect(ing).toContain("secretName: r-neoboard-tls");
  });

  it("wires METRICS_TOKEN and the ServiceMonitor bearer token from one Secret", () => {
    const k = render({
      "metrics.enabled": true,
      "metrics.tokenSecret.name": "nb-metrics",
      "metrics.serviceMonitor.enabled": true,
    });
    expect(k.ServiceMonitor[0]).toContain("path: /api/metrics");
    expect(k.ServiceMonitor[0]).toMatch(/bearerTokenSecret:\n\s+name: nb-metrics/);
    expect(k.Deployment[0]).toMatch(/METRICS_TOKEN\n\s+valueFrom:\n\s+secretKeyRef:\n\s+name: nb-metrics/);
  });

  it("uses existingSecret and creates no Secret of its own", () => {
    const k = render({ existingSecret: "mine" });
    expect(k.Secret).toBeUndefined();
    expect(k.Deployment[0]).toMatch(/secretRef:\n\s+name: mine/);
  });

  it.skipIf(!NOTES_OK)("warns about per-process limits only above one replica", () => {
    expect(renderNotes()).toContain("ENCRYPTION_KEY");
    expect(renderNotes()).not.toContain("WARNING");
    const notes = renderNotes({ replicaCount: 2 });
    expect(notes).toContain("WARNING");
    expect(notes).toContain("rate limits");
  });
});
