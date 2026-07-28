import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guards the release pipeline's supply-chain invariants (#1224).
//
// `.github/workflows/release.yml` runs on ONE trigger: a pushed `v*` tag.
// That means nothing in it executes during normal CI — every line is
// untested until someone cuts a real release, and a typo there is found at
// the worst possible moment. These assertions are the only thing standing
// between a bad edit and a broken launch.
//
// Deliberately textual, not YAML-parsed: the repo has no YAML parser in its
// dependency tree (see scripts/__tests__/docs-accuracy.test.mjs for the same
// house style), and adding one to assert nine facts about one file is a
// worse trade than a regex. If this file grows a tenth kind of assertion,
// reach for a parser then.
//
// What this canNOT check: that any of it actually works against a live
// registry. See the dry-run note in release.yml.

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const YML = readFileSync(join(ROOT, ".github/workflows/release.yml"), "utf8");

/**
 * The same text with `#` comments removed, for assertions that ask what the
 * workflow DOES rather than what it says. release.yml is heavily commented
 * and several comments quote the very strings being asserted on ("cosign
 * sign...", "attestations: write") — matching those would pass on prose.
 *
 * Naive on purpose: no `#` in this file appears inside a quoted string. If
 * one ever does, this drops the rest of that line and a test fails loudly
 * rather than silently passing.
 */
function stripComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/#.*$/, ""))
    .join("\n");
}

/**
 * The text of one top-level job, from `  <name>:` up to the next job.
 * Job keys sit at exactly two spaces of indentation.
 */
function jobBlock(name) {
  const lines = YML.split("\n");
  const start = lines.indexOf(`  ${name}:`);
  expect(start, `job "${name}" not found in release.yml`).toBeGreaterThan(-1);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

// Stripped: every assertion below is about what the job does, not what its
// comments say.
const DOCKER = stripComments(jobBlock("docker"));

describe("release workflow: action pinning", () => {
  it("pins every action to a tag, never a branch", () => {
    const refs = [...YML.matchAll(/uses:\s+(\S+)/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);

    for (const ref of refs) {
      // `owner/repo@ref` — the ref must look like a version, not a branch.
      // A floating `@main` means a third party can change what runs inside
      // a job holding packages:write and id-token:write.
      expect(ref, `unpinned action ref: ${ref}`).toMatch(/@v?\d+(\.\d+)*$/);
    }
  });

  it("does not regress to a branch ref", () => {
    expect(YML).not.toMatch(/uses:\s+\S+@(main|master|HEAD)\b/);
  });
});

describe("release workflow: permissions are least-privilege", () => {
  it("keeps the top-level default at contents: read", () => {
    // Anything broader here silently widens every job that does not
    // declare its own `permissions:` block.
    const topLevel = YML.slice(0, YML.indexOf("\njobs:"));
    expect(topLevel).toMatch(/^permissions:\n {2}contents: read\n/m);
  });

  it("grants the docker job exactly the four scopes it needs", () => {
    for (const scope of [
      "contents: read", // actions/checkout
      "packages: write", // ghcr push + cosign signature/SBOM artifacts
      "id-token: write", // cosign keyless OIDC -> Fulcio
      "security-events: write", // Trivy SARIF -> code scanning
    ]) {
      expect(DOCKER, `docker job is missing "${scope}"`).toContain(scope);
    }
  });

  it("grants no write scope beyond that set", () => {
    const permsBlock = DOCKER.slice(
      DOCKER.indexOf("permissions:"),
      DOCKER.indexOf("steps:"),
    );
    const granted = [...permsBlock.matchAll(/^ {6}(\S+):\s*write/gm)].map(
      (m) => m[1],
    );
    expect(granted.sort()).toEqual(["id-token", "packages", "security-events"]);
  });

  it("never grants attestations: write", () => {
    // SBOM/provenance here are OCI attestations pushed to ghcr by BuildKit,
    // NOT entries in GitHub's attestations API. `attestations: write` would
    // be handed out for a capability nothing in this workflow uses.
    expect(stripComments(YML)).not.toContain("attestations: write");
  });

  it("does not grant contents: write outside the release job", () => {
    expect(DOCKER).not.toContain("contents: write");
    expect(jobBlock("publish-cli")).not.toContain("contents: write");
  });
});

describe("release workflow: multi-arch build", () => {
  it("builds both amd64 and arm64", () => {
    expect(DOCKER).toMatch(/platforms:\s*linux\/amd64,linux\/arm64/);
  });

  it("sets up QEMU, without which the arm64 leg cannot run on an x86 runner", () => {
    expect(DOCKER).toContain("docker/setup-qemu-action@");
    expect(DOCKER.indexOf("docker/setup-qemu-action@")).toBeLessThan(
      DOCKER.indexOf("docker/build-push-action@"),
    );
  });

  it("attaches an SBOM to the pushed image", () => {
    expect(DOCKER).toMatch(/^\s+sbom: true$/m);
  });
});

describe("release workflow: signing", () => {
  it("signs after the push, not before", () => {
    // cosign signs a digest that must already exist in the registry.
    // Reordering these silently signs nothing.
    const push = DOCKER.indexOf("docker/build-push-action@");
    const sign = DOCKER.indexOf("cosign sign");
    expect(push).toBeGreaterThan(-1);
    expect(sign).toBeGreaterThan(-1);
    expect(sign).toBeGreaterThan(push);
  });

  it("signs the immutable digest, not a mutable tag", () => {
    expect(DOCKER).toMatch(/cosign sign --yes "\$\{IMAGE\}@\$\{DIGEST\}"/);
  });

  it("wires the signing step to the build step's real output", () => {
    // A renamed `id:` would leave DIGEST empty and cosign would sign the
    // literal string "ghcr.io/owner/repo@" — which fails loudly, but only
    // during a live release. Catch it here instead.
    const buildId = DOCKER.match(/- name: Build and push\n\s+id: (\S+)\n/)?.[1];
    expect(buildId, "build-push step has no id:").toBeTruthy();
    expect(DOCKER).toContain(`steps.${buildId}.outputs.digest`);
  });
});

describe("release workflow: vulnerability scanning", () => {
  it("scans the published image", () => {
    expect(DOCKER).toContain("aquasecurity/trivy-action@");
  });

  it("reports rather than fails the release", () => {
    // Deliberate (#1224). A multi-arch image cannot be loaded locally, so it
    // can only be scanned AFTER push — failing here would not unpublish
    // anything, it would just paint a live release red. Flipping this to "1"
    // is a real policy change: update this test and the comment in
    // release.yml together, or not at all.
    expect(DOCKER).toMatch(/exit-code: "0"/);
  });

  it("filters out findings nobody can act on", () => {
    // A gate that fires on unfixed base-image CVEs gets switched off.
    expect(DOCKER).toMatch(/ignore-unfixed: true/);
  });

  it("applies the severity filter to the SARIF, not just the table", () => {
    // trivy-action defaults this off, so `severity: HIGH,CRITICAL` would be
    // ignored for SARIF and the Security tab would fill with LOW/MEDIUM.
    expect(DOCKER).toMatch(/severity: HIGH,CRITICAL/);
    expect(DOCKER).toMatch(/limit-severities-for-sarif: true/);
  });

  it("uploads findings to code scanning so a report is not a shrug", () => {
    expect(DOCKER).toContain("github/codeql-action/upload-sarif@");
    expect(DOCKER.indexOf("aquasecurity/trivy-action@")).toBeLessThan(
      DOCKER.indexOf("github/codeql-action/upload-sarif@"),
    );
  });
});

describe("release workflow: latest tag safety", () => {
  it("considers only plain vX.Y.Z tags when picking the highest version", () => {
    // `sort -V` ranks v1.4.0-rc.1 ABOVE v1.4.0, so without this filter a
    // throwaway rc tag steals `latest` — and keeps it even after the real
    // release ships. Verified: `printf 'v1.4.0\nv1.4.0-rc.1\n' | sort -V`.
    // This also makes an rc tag a safe way to dry-run the whole workflow.
    expect(DOCKER).toMatch(
      /git tag -l 'v\*' \| grep -E '\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$' \| sort -V/,
    );
  });
});
