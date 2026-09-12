import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
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

/**
 * The `run: |` script of one step inside a job block, dedented, so a test can
 * execute what the workflow executes instead of a JS copy of it.
 */
function stepScript(block, name) {
  const lines = block.split("\n");
  const at = lines.findIndex((l) => l.trim() === `- name: ${name}`);
  expect(at, `step "${name}" not found`).toBeGreaterThan(-1);
  const next = lines.findIndex((l, i) => i > at && l.trim().startsWith("- name:"));
  const run = lines.findIndex((l, i) => i > at && /^\s+run: \|$/.test(l));
  expect(run, `step "${name}" has no run: | script`).toBeGreaterThan(-1);
  if (next !== -1) expect(run).toBeLessThan(next);
  const indent = lines[run].search(/\S/);
  const body = [];
  for (const l of lines.slice(run + 1)) {
    if (l.trim() !== "" && l.search(/\S/) <= indent) break;
    body.push(l.slice(indent + 2));
  }
  return body.join("\n");
}

/**
 * Runs a step script the way Actions does (`bash -e`), with the release body
 * redirected into a temp dir. Returns the step's outputs and that body.
 */
function runStep(script, { cwd, ref, env = {} }) {
  const dir = mkdtempSync(join(tmpdir(), "release-step-"));
  const read = (f) => {
    try {
      return readFileSync(join(dir, f), "utf8");
    } catch {
      return "";
    }
  };
  try {
    execFileSync(
      "bash",
      ["-e", "-c", script.replaceAll("/tmp/release-body.md", join(dir, "body.md"))],
      { cwd, env: { ...process.env, ...env, GITHUB_REF: ref, GITHUB_OUTPUT: join(dir, "output") }, stdio: "pipe" },
    );
    const outputs = Object.fromEntries(
      read("output").split("\n").filter(Boolean).map((l) => l.split("=")),
    );
    return { outputs, body: read("body.md") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The trimmed CHANGELOG.md text under `## [v]`, up to the next heading. */
function changelogSection(v) {
  const lines = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8").split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## [${v}]`));
  if (start === -1) return "";
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## ["));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .trim();
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

describe("release workflow: image name (#1780)", () => {
  // OCI references must be lowercase. docker/metadata-action lowercases the
  // image it pushes; cosign and Trivy take the ref verbatim. Under an owner
  // like GraphWave-Consulting the push succeeds, then signing fails and the
  // release goes red. So the name is lowercased once and every step reads it.
  // Built from the step's real `id:`, so a renamed id fails the reader checks
  // here instead of emptying `images:`, IMAGE and image-ref in a live release.
  const imageId = DOCKER.match(/- name: Compute the image name\n\s+id: (\S+)\n/)?.[1];
  const IMAGE = `\${{ steps.${imageId}.outputs.name }}`;

  it("gives the image-name step an id the readers can reference", () => {
    expect(imageId, "Compute the image name step has no id:").toBeTruthy();
  });

  it("lowercases the owner and repo into one image name", () => {
    const script = stepScript(jobBlock("docker"), "Compute the image name");
    const { outputs } = runStep(script, {
      cwd: ROOT,
      ref: "refs/tags/v1.5.0",
      env: { GITHUB_REPOSITORY: "GraphWave-Consulting/NeoBoard" },
    });
    expect(outputs.name).toBe("ghcr.io/graphwave-consulting/neoboard");
  });

  it("never hands github.repository to a step as-is", () => {
    expect(DOCKER).not.toContain("github.repository");
  });

  it("pushes, signs and scans that one name", () => {
    expect(DOCKER).toContain(`images: ${IMAGE}\n`);
    expect(DOCKER).toContain(`IMAGE: ${IMAGE}\n`);
    expect(DOCKER).toContain(`image-ref: ${IMAGE}@\${{ steps.build.outputs.digest }}\n`);
  });

  it("computes the name before the first step that reads it", () => {
    expect(DOCKER.indexOf("- name: Compute the image name")).toBeGreaterThan(-1);
    expect(DOCKER.indexOf("- name: Compute the image name")).toBeLessThan(
      DOCKER.indexOf(IMAGE),
    );
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

describe("release workflow: tag classification", () => {
  // Raw, not stripped: the scripts contain `#` (`${GITHUB_REF#refs/tags/}`).
  const RELEASE = jobBlock("release");
  const CREATE = stripComments(
    RELEASE.slice(RELEASE.indexOf("- name: Create GitHub Release")),
  );

  /** A throwaway repo holding exactly these tags. */
  function repoWithTags(tags) {
    const dir = mkdtempSync(join(tmpdir(), "release-tags-"));
    const git = (...args) =>
      execFileSync(
        "git",
        ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args],
        { cwd: dir, stdio: "pipe" },
      );
    git("init", "-q");
    git("commit", "-q", "--allow-empty", "-m", "x");
    for (const t of tags) git("tag", t);
    return dir;
  }

  function classify(tag, tags) {
    const cwd = repoWithTags(tags);
    try {
      return runStep(stepScript(RELEASE, "Classify the tag"), { cwd, ref: `refs/tags/${tag}` }).outputs;
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }

  it("treats only plain vX.Y.Z as a full release", () => {
    for (const tag of ["v1.5.0-rc.1", "vnext", "v1.5", "v1.5.0+build.1"]) {
      expect(classify(tag, ["v1.4.0", tag]).plain, tag).toBe("false");
    }
    expect(classify("v1.5.0", ["v1.5.0"]).plain).toBe("true");
  });

  it("makes the highest plain tag latest", () => {
    expect(classify("v1.5.0", ["v1.4.0", "v1.5.0"]).is_latest).toBe("true");
  });

  it("never lets a back-published patch take latest (#982)", () => {
    expect(classify("v1.5.1", ["v1.5.0", "v1.6.0", "v1.5.1"]).is_latest).toBe("false");
  });

  it("never lets an rc take latest, though sort -V ranks it above the release (#1224)", () => {
    // `printf 'v1.4.0\nv1.4.0-rc.1\n' | sort -V` puts the rc last. This is
    // also what makes an rc tag a safe way to dry-run the whole workflow.
    expect(classify("v1.4.0-rc.1", ["v1.4.0", "v1.4.0-rc.1"]).is_latest).toBe("false");
    expect(classify("v1.4.0-rc.1", ["v1.4.0-rc.1"]).is_latest).toBe("false");
  });

  it("checks out every tag, or the highest-version comparison sees none", () => {
    const checkout = RELEASE.slice(
      RELEASE.indexOf("- name: Checkout"),
      RELEASE.indexOf("- name: Classify the tag"),
    );
    expect(stripComments(checkout)).toMatch(/fetch-depth: 0/);
  });

  it("feeds both facts to the GitHub Release, so its Latest badge matches the image's", () => {
    expect(CREATE).toContain("softprops/action-gh-release@");
    expect(CREATE).toMatch(/^ {10}prerelease: \$\{\{ steps\.tag\.outputs\.plain != 'true' \}\}$/m);
    expect(CREATE).toMatch(/^ {10}make_latest: \$\{\{ steps\.tag\.outputs\.is_latest \}\}$/m);
  });

  it("moves the docker latest tag on the same fact, computed once", () => {
    expect(stripComments(RELEASE)).toMatch(/^ {6}is_latest: \$\{\{ steps\.tag\.outputs\.is_latest \}\}$/m);
    expect(DOCKER).toContain(
      "type=raw,value=latest,enable=${{ needs.release.outputs.is_latest == 'true' }}",
    );
    expect(DOCKER).toMatch(/needs: release/);
  });
});

describe("release workflow: GitHub Release body", () => {
  const EXTRACT = stepScript(jobBlock("release"), "Extract changelog for this version");
  const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

  it("is the CHANGELOG section for the tag's version, and only that section", () => {
    const { body } = runStep(EXTRACT, { cwd: ROOT, ref: `refs/tags/v${version}` });
    expect(body.trim()).toBe(changelogSection(version));
    expect(body).not.toContain("## [");
  });

  it("falls back to the tag name when the CHANGELOG has no section for it", () => {
    const { body } = runStep(EXTRACT, { cwd: ROOT, ref: `refs/tags/v${version}-rc.1` });
    expect(body.trim()).toBe(`Release v${version}-rc.1`);
  });
});

describe("release versions", () => {
  // The release body is the CHANGELOG section for the tag. If the heading and
  // package.json disagree, release.yml silently publishes "Release vX.Y.Z".
  const read = (p) => readFileSync(join(ROOT, p), "utf8");
  const version = JSON.parse(read("package.json")).version;

  it("declares a plain X.Y.Z version on the root package", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each(["app", "component", "connection", "docs"])(
    "%s/package.json carries the release version",
    (pkg) => {
      expect(JSON.parse(read(`${pkg}/package.json`)).version).toBe(version);
    },
  );

  it("keeps cli/package.json off the release version, so publish-cli skips", () => {
    // v1.5 plan decision: the CLI stays at its own version so the publish-cli
    // job (tag == cli version) skips on v1.5.0; NPM_TOKEN is not configured.
    // Delete this case in v1.7, when @neoboard/cli is published for the first time.
    expect(JSON.parse(read("cli/package.json")).version).not.toBe(version);
  });

  it("keeps package-lock.json in step with the workspace versions", () => {
    const lock = JSON.parse(read("package-lock.json"));
    expect(lock.version).toBe(version);
    for (const key of ["", "app", "component", "connection"]) {
      expect(lock.packages[key].version, `lock entry "${key}"`).toBe(version);
    }
  });

  it("keeps docs/package-lock.json in step with docs/package.json", () => {
    const lock = JSON.parse(read("docs/package-lock.json"));
    expect(lock.version).toBe(version);
    expect(lock.packages[""].version).toBe(version);
  });

  it("has a non-empty CHANGELOG section for the release version", () => {
    expect(changelogSection(version)).not.toBe("");
  });
});
