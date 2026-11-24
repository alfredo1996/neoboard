import { describe, it, expect } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
const LIB_YML = readFileSync(
  join(ROOT, ".github/workflows/release-libraries.yml"),
  "utf8",
);
const LIB_SCRIPT = join(ROOT, "scripts/release-library.sh");

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
function jobBlock(name, yml = YML) {
  const lines = yml.split("\n");
  const start = lines.indexOf(`  ${name}:`);
  expect(start, `job "${name}" not found`).toBeGreaterThan(-1);
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
  const next = lines.findIndex(
    (l, i) => i > at && l.trim().startsWith("- name:"),
  );
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
      [
        "-e",
        "-c",
        script.replaceAll("/tmp/release-body.md", join(dir, "body.md")),
      ],
      {
        cwd,
        env: {
          ...process.env,
          ...env,
          GITHUB_REF: ref,
          GITHUB_OUTPUT: join(dir, "output"),
        },
        stdio: "pipe",
      },
    );
    const outputs = Object.fromEntries(
      read("output")
        .split("\n")
        .filter(Boolean)
        .map((l) => l.split("=")),
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
    const refs = [YML, LIB_YML].flatMap((y) =>
      [...y.matchAll(/uses:\s+(\S+)/g)].map((m) => m[1]),
    );
    expect(refs.length).toBeGreaterThan(0);

    for (const ref of refs) {
      // `owner/repo@ref` — the ref must look like a version, not a branch.
      // A floating `@main` means a third party can change what runs inside
      // a job holding packages:write and id-token:write.
      expect(ref, `unpinned action ref: ${ref}`).toMatch(/@v?\d+(\.\d+)*$/);
    }
  });

  it("does not regress to a branch ref", () => {
    expect(YML + LIB_YML).not.toMatch(/uses:\s+\S+@(main|master|HEAD)\b/);
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
    expect(stripComments(YML + LIB_YML)).not.toContain("attestations: write");
  });

  it("does not grant contents: write outside the release job", () => {
    expect(DOCKER).not.toContain("contents: write");
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

describe("release workflow: a hung build is bounded (#2530)", () => {
  // [job, lowest cap that still clears a healthy run, highest cap that is
  // still "bounded"]. Healthy: docker 23-41 min, release 9-15 s.
  it.each([
    ["docker", 60, 90],
    ["release", 10, 30],
  ])("caps the %s job between %i and %i minutes", (job, lo, hi) => {
    const m = jobBlock(job).match(/^ {4}timeout-minutes:\s*(\d+)\s*$/m);
    expect(m, `${job} sets timeout-minutes`).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(lo);
    expect(Number(m[1])).toBeLessThanOrEqual(hi);
  });

  it("runs the deps stage's npm ci with a fetch timeout under npm's 300 s default and 2+ retries", () => {
    const file = readFileSync(join(ROOT, "Dockerfile"), "utf8");
    const deps = file.split(/^FROM /m).find((s) => s.includes(" AS deps"));
    const m = deps.match(
      /^RUN npm_config_fetch_timeout=(\d+) npm_config_fetch_retries=(\d+) npm ci$/m,
    );
    expect(m, "deps stage runs npm ci with both settings").not.toBeNull();
    expect(Number(m[1])).toBeLessThan(300000);
    expect(Number(m[2])).toBeGreaterThanOrEqual(2);
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
  const imageId = DOCKER.match(
    /- name: Compute the image name\n\s+id: (\S+)\n/,
  )?.[1];
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
    expect(DOCKER).toContain(
      `image-ref: ${IMAGE}@\${{ steps.build.outputs.digest }}\n`,
    );
  });

  it("computes the name before the first step that reads it", () => {
    expect(DOCKER.indexOf("- name: Compute the image name")).toBeGreaterThan(
      -1,
    );
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
        [
          "-c",
          "user.name=t",
          "-c",
          "user.email=t@t",
          "-c",
          "commit.gpgsign=false",
          "-c",
          "tag.gpgsign=false",
          ...args,
        ],
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
      return runStep(stepScript(RELEASE, "Classify the tag"), {
        cwd,
        ref: `refs/tags/${tag}`,
      }).outputs;
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
    expect(classify("v1.5.1", ["v1.5.0", "v1.6.0", "v1.5.1"]).is_latest).toBe(
      "false",
    );
  });

  it("never lets an rc take latest, though sort -V ranks it above the release (#1224)", () => {
    // `printf 'v1.4.0\nv1.4.0-rc.1\n' | sort -V` puts the rc last. This is
    // also what makes an rc tag a safe way to dry-run the whole workflow.
    expect(classify("v1.4.0-rc.1", ["v1.4.0", "v1.4.0-rc.1"]).is_latest).toBe(
      "false",
    );
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
    expect(CREATE).toMatch(
      /^ {10}prerelease: \$\{\{ steps\.tag\.outputs\.plain != 'true' \}\}$/m,
    );
    expect(CREATE).toMatch(
      /^ {10}make_latest: \$\{\{ steps\.tag\.outputs\.is_latest \}\}$/m,
    );
  });

  it("moves the docker latest tag on the same fact, computed once", () => {
    expect(stripComments(RELEASE)).toMatch(
      /^ {6}is_latest: \$\{\{ steps\.tag\.outputs\.is_latest \}\}$/m,
    );
    expect(DOCKER).toContain(
      "type=raw,value=latest,enable=${{ needs.release.outputs.is_latest == 'true' }}",
    );
    expect(DOCKER).toMatch(/needs: release/);
  });
});

describe("release workflow: GitHub Release body", () => {
  const EXTRACT = stepScript(
    jobBlock("release"),
    "Extract changelog for this version",
  );
  const version = JSON.parse(
    readFileSync(join(ROOT, "package.json"), "utf8"),
  ).version;

  it("is the CHANGELOG section for the tag's version, and only that section", () => {
    const { body } = runStep(EXTRACT, {
      cwd: ROOT,
      ref: `refs/tags/v${version}`,
    });
    expect(body.trim()).toBe(changelogSection(version));
    expect(body).not.toContain("## [");
  });

  it("falls back to the tag name when the CHANGELOG has no section for it", () => {
    const { body } = runStep(EXTRACT, {
      cwd: ROOT,
      ref: `refs/tags/v${version}-rc.1`,
    });
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

  it("documents nothing older than 1.0.0 (#1871)", () => {
    // The pre-public cycle ([2.0.0] and [0.9.1]..[0.1.0]) described a product
    // that was never released under these numbers. Versioning resets at
    // 1.0.0, so that is the oldest heading.
    const headings = [
      ...read("CHANGELOG.md").matchAll(/^## \[(\d+)\.(\d+)\.(\d+)\]/gm),
    ].map((m) => m.slice(1, 4).map(Number));
    expect(headings.length).toBeGreaterThan(0); // the heading regex still matches
    expect(
      headings
        // A floor, not an equality: 2.0.0 must be able to add its own section.
        .filter(([maj]) => maj < 1)
        .map((v) => `[${v.join(".")}]`),
    ).toEqual([]);
  });
});

describe("release.yml publishes nothing to npm (#1876)", () => {
  it("has no publish-cli job and no npm publish or token", () => {
    const code = stripComments(YML);
    expect(code).not.toContain("publish-cli");
    expect(code).not.toContain("npm publish");
    expect(code).not.toContain("NPM_TOKEN");
    expect(code).not.toContain("NODE_AUTH_TOKEN");
  });

  it("still triggers on v* tags only", () => {
    expect(YML).toMatch(
      /^on:\n {2}push:\n {4}tags: \["v\*"\]\n\npermissions:/m,
    );
  });
});

describe("library workflow: triggers (#1876)", () => {
  const TAGS = ["@neoboard/cli@*", "@neoboard/connector-sdk@*"];

  it("fires on exactly the two library tag globs, and on PRs only for their paths", () => {
    const on = LIB_YML.slice(
      LIB_YML.indexOf("\non:"),
      LIB_YML.indexOf("\npermissions:"),
    );
    const tags = on.slice(on.indexOf("tags:"), on.indexOf("pull_request:"));
    expect(
      [...tags.matchAll(/"(@neoboard\/[^"]+)"/g)].map((m) => m[1]),
    ).toEqual(TAGS);
    for (const p of [
      "cli/**",
      "connector-sdk/**",
      ".github/workflows/release-libraries.yml",
    ]) {
      expect(on.slice(on.indexOf("pull_request:"))).toContain(p);
    }
  });

  it("never matches the v* trigger of release.yml", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-tags-"));
    try {
      const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
      git("init", "-q");
      git(
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@t",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "x",
      );
      for (const t of [
        "@neoboard/cli@1.7.0",
        "@neoboard/connector-sdk@0.2.0",
      ]) {
        git("tag", t);
      }
      expect(git("tag", "-l", "v*").toString()).toBe("");
      expect(git("tag", "-l", "@neoboard/cli@*").toString().trim()).toBe(
        "@neoboard/cli@1.7.0",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("library release script (#1876)", () => {
  // The verify job runs scripts/release-library.sh; so does this test.
  const fixture = (pkgs) => {
    const dir = mkdtempSync(join(tmpdir(), "release-lib-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    for (const [d, { name, version, changelog }] of Object.entries(pkgs)) {
      mkdirSync(join(dir, d));
      writeFileSync(
        join(dir, d, "package.json"),
        JSON.stringify({ name, version }),
      );
      if (changelog !== undefined) {
        writeFileSync(join(dir, d, "CHANGELOG.md"), changelog);
      }
    }
    return dir;
  };
  const CL =
    "# Changelog\n\n## [Unreleased]\n\n## [1.2.3] - 2026-01-01\n\n- the 1.2.3 change\n\n## [1.2.2]\n\n- older\n";
  const PKGS = {
    cli: { name: "@neoboard/cli", version: "1.2.3", changelog: CL },
    "connector-sdk": {
      name: "@neoboard/connector-sdk",
      version: "1.2.3",
      changelog: CL,
    },
  };
  const run = (dir, tag) => {
    const out = join(dir, "out");
    const body = join(dir, "body.md");
    try {
      execFileSync("bash", [LIB_SCRIPT, tag], {
        cwd: dir,
        env: { ...process.env, GITHUB_OUTPUT: out, RELEASE_BODY: body },
        stdio: "pipe",
      });
    } catch {
      return { ok: false };
    }
    const outputs = Object.fromEntries(
      readFileSync(out, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => l.split("=")),
    );
    return { ok: true, outputs, body: readFileSync(body, "utf8") };
  };
  const withFixture = (pkgs, fn) => {
    const dir = fixture(pkgs);
    try {
      return fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it.each([
    ["@neoboard/cli@1.2.3", "cli", "@neoboard/cli"],
    [
      "@neoboard/connector-sdk@1.2.3",
      "connector-sdk",
      "@neoboard/connector-sdk",
    ],
  ])("passes %s and returns only its section", (tag, dirName, name) => {
    withFixture(PKGS, (dir) => {
      const r = run(dir, tag);
      expect(r.ok).toBe(true);
      expect(r.outputs).toMatchObject({ dir: dirName, version: "1.2.3", name });
      expect(r.body.trim()).toBe("- the 1.2.3 change");
    });
  });

  it.each([
    ["a version differing from package.json", "@neoboard/cli@1.2.4"],
    ["an unknown package name", "@neoboard/components@1.2.3"],
    ["a non-plain version", "@neoboard/cli@1.2.3-rc.1"],
    ["a malformed tag", "cli@1.2.3"],
    ["a tag with no version", "@neoboard/cli@"],
  ])("fails on %s", (_, tag) => {
    withFixture(PKGS, (dir) => expect(run(dir, tag).ok).toBe(false));
  });

  it("fails when package.json names a different package than the tag", () => {
    withFixture(
      { ...PKGS, cli: { ...PKGS.cli, name: "@neoboard/other" } },
      (dir) => expect(run(dir, "@neoboard/cli@1.2.3").ok).toBe(false),
    );
  });

  it.each([
    ["missing", undefined],
    ["without the version's section", "# Changelog\n\n## [Unreleased]\n"],
    ["a section that is empty", "## [1.2.3]\n\n## [1.2.2]\n- x\n"],
    ["a heading that only matches as a regex", "## [1x2x3]\n- wrong\n"],
  ])(
    "fails, with no fallback text, when the CHANGELOG is %s",
    (_, changelog) => {
      withFixture({ ...PKGS, cli: { ...PKGS.cli, changelog } }, (dir) =>
        expect(run(dir, "@neoboard/cli@1.2.3").ok).toBe(false),
      );
    },
  );
});

describe("library workflow: jobs (#1876)", () => {
  const job = (n) => stripComments(jobBlock(n, LIB_YML));
  const granted = (n) =>
    [...job(n).matchAll(/^ {6}(\S+): (read|write)\s*$/gm)].map(
      (m) => `${m[1]}: ${m[2]}`,
    );

  it("defaults to contents: read at the top level", () => {
    expect(LIB_YML.slice(0, LIB_YML.indexOf("\njobs:"))).toMatch(
      /^permissions:\n {2}contents: read\n/m,
    );
  });

  it("grants publish exactly contents: read and id-token: write", () => {
    expect(granted("publish").sort()).toEqual([
      "contents: read",
      "id-token: write",
    ]);
  });

  it("grants contents: write only to github-release", () => {
    expect(granted("github-release")).toContain("contents: write");
    for (const j of ["verify", "publish", "dry-run"]) {
      expect(job(j)).not.toContain("contents: write");
    }
  });

  it("gives dry-run and verify no id-token", () => {
    expect(job("dry-run")).not.toContain("id-token");
    expect(job("verify")).not.toContain("id-token");
  });

  it("publishes behind the npm-publish environment, on tag pushes only, after verify", () => {
    const p = job("publish");
    expect(p).toMatch(/^ {4}environment: npm-publish$/m);
    expect(p).toMatch(/needs: verify/);
    expect(p).toContain("github.event_name == 'push'");
    expect(job("github-release")).toMatch(/needs: publish/);
    expect(job("dry-run")).toContain("github.event_name == 'pull_request'");
  });

  it("publishes with provenance on Node >= 22.14 after an npm >= 11.5.1 guard", () => {
    const p = job("publish");
    expect(p).toContain("--provenance --access public");
    const node = p.match(/node-version: "?(\d+)(?:\.(\d+))?/);
    expect(node, "publish sets node-version").not.toBeNull();
    const [maj, min] = [Number(node[1]), Number(node[2] ?? 0)];
    expect(maj > 22 || (maj === 22 && min >= 14)).toBe(true);
    expect(p).toContain("11.5.1");
    expect(p.indexOf("11.5.1")).toBeLessThan(p.indexOf("npm publish"));
  });

  it("authenticates by OIDC alone, with no token anywhere", () => {
    expect(LIB_YML).not.toContain("NPM_TOKEN");
    expect(LIB_YML).not.toContain("NODE_AUTH_TOKEN");
  });

  it("never takes the product's Latest badge", () => {
    expect(job("github-release")).toMatch(/make_latest: false/);
  });

  it("runs the verify script, whose failure stops the run before approval", () => {
    expect(job("verify")).toContain("scripts/release-library.sh");
  });
});

describe("library release prep (#1876)", () => {
  const read = (p) => readFileSync(join(ROOT, p), "utf8");

  it("keeps components private", () => {
    expect(JSON.parse(read("component/package.json")).private).toBe(true);
  });

  it("links connection to the SDK by workspace range", () => {
    const sdk = "@neoboard/connector-sdk";
    expect(JSON.parse(read("connection/package.json")).dependencies[sdk]).toBe(
      "*",
    );
    expect(
      JSON.parse(read("package-lock.json")).packages.connection.dependencies[
        sdk
      ],
    ).toBe("*");
  });

  it.each(["cli", "connector-sdk"])(
    "%s has a changelog with an Unreleased section",
    (d) => {
      expect(read(`${d}/CHANGELOG.md`)).toMatch(/^## \[Unreleased\]$/m);
    },
  );
});
